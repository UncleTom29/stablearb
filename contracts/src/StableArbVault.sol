// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {SUSD} from "./SUSD.sol";

/// @title StableArbVault
/// @notice Core vault: users deposit ETH or WBTC as collateral and mint SUSD.
///         A minimum collateral ratio of 150 % is enforced at all times.
///         Liquidation is possible when the ratio falls below 120 %.
contract StableArbVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────────

    uint256 public constant PRECISION = 1e18;
    uint256 public constant MIN_COLLATERAL_RATIO = 150; // 150 %
    uint256 public constant LIQUIDATION_RATIO = 120;    // 120 %
    uint256 public constant LIQUIDATION_BONUS = 10;     //  10 % bonus for liquidator
    uint256 public constant RATIO_DENOMINATOR = 100;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    SUSD public immutable susd;

    struct CollateralToken {
        address priceFeed;   // Chainlink AggregatorV3 price feed (token / USD, 8 decimals)
        uint8   decimals;    // Token decimals
        bool    enabled;
    }

    mapping(address token => CollateralToken) public collateralTokens;
    address[] public supportedTokens;

    // user → token → deposited amount
    mapping(address user => mapping(address token => uint256 amount)) public collateralDeposits;
    // user → total SUSD minted
    mapping(address user => uint256 debt) public susdDebt;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event CollateralDeposited(address indexed user, address indexed token, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed token, uint256 amount);
    event SUSDMinted(address indexed user, uint256 amount);
    event SUSDBurned(address indexed user, uint256 amount);
    event Liquidated(
        address indexed liquidator,
        address indexed user,
        address indexed token,
        uint256 debtRepaid,
        uint256 collateralSeized
    );
    event CollateralTokenAdded(address indexed token, address priceFeed, uint8 decimals);
    event CollateralTokenUpdated(address indexed token, address priceFeed, bool enabled);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error TokenNotSupported();
    error InsufficientCollateral();
    error BelowMinCollateralRatio();
    error AboveLiquidationRatio();
    error ZeroAmount();
    error ZeroAddress();
    error StalePrice();
    error InvalidPrice();
    error ExceedsDebt();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address _susd) Ownable(msg.sender) {
        if (_susd == address(0)) revert ZeroAddress();
        susd = SUSD(_susd);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Register a collateral token with its Chainlink price feed.
    function addCollateralToken(
        address token,
        address priceFeed,
        uint8   decimals_
    ) external onlyOwner {
        if (priceFeed == address(0)) revert ZeroAddress();
        collateralTokens[token] = CollateralToken({
            priceFeed: priceFeed,
            decimals:  decimals_,
            enabled:   true
        });
        if (token != address(0)) supportedTokens.push(token);
        emit CollateralTokenAdded(token, priceFeed, decimals_);
    }

    /// @notice Update a collateral token's price feed or enabled flag.
    function updateCollateralToken(
        address token,
        address priceFeed,
        bool    enabled
    ) external onlyOwner {
        if (collateralTokens[token].priceFeed == address(0)) revert TokenNotSupported();
        collateralTokens[token].priceFeed = priceFeed;
        collateralTokens[token].enabled   = enabled;
        emit CollateralTokenUpdated(token, priceFeed, enabled);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // User actions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Deposit ERC-20 collateral and optionally mint SUSD in one tx.
    /// @param token       Collateral token address.
    /// @param amount      Collateral amount (in token decimals).
    /// @param mintAmount  Amount of SUSD to mint (0 = skip minting).
    function depositAndMint(
        address token,
        uint256 amount,
        uint256 mintAmount
    ) external nonReentrant {
        _depositCollateral(token, amount);
        if (mintAmount > 0) {
            _mintSUSD(mintAmount);
        }
    }

    /// @notice Deposit ETH as collateral and optionally mint SUSD.
    /// @param mintAmount Amount of SUSD to mint (0 = skip minting).
    function depositETHAndMint(uint256 mintAmount) external payable nonReentrant {
        _depositETH();
        if (mintAmount > 0) {
            _mintSUSD(mintAmount);
        }
    }

    /// @notice Burn SUSD debt and optionally withdraw collateral in one tx.
    /// @param burnAmount      Amount of SUSD to burn (0 = skip burning).
    /// @param token           Collateral token to withdraw (address(0) = ETH).
    /// @param withdrawAmount  Amount of collateral to withdraw (0 = skip withdrawal).
    function burnAndWithdraw(
        uint256 burnAmount,
        address token,
        uint256 withdrawAmount
    ) external nonReentrant {
        if (burnAmount > 0) {
            _burnSUSD(burnAmount);
        }
        if (withdrawAmount > 0) {
            _withdrawCollateral(token, withdrawAmount);
        }
    }

    /// @notice Liquidate an undercollateralised position.
    /// @param user   The address whose position is being liquidated.
    /// @param token  The collateral token to seize.
    /// @param debtToCover  Amount of SUSD debt the liquidator repays.
    function liquidate(
        address user,
        address token,
        uint256 debtToCover
    ) external nonReentrant {
        if (_collateralRatio(user) >= LIQUIDATION_RATIO) revert AboveLiquidationRatio();

        uint256 userDebt = susdDebt[user];
        if (debtToCover > userDebt) revert ExceedsDebt();

        // Calculate collateral to seize (value of debt + liquidation bonus)
        uint256 collateralPrice = _getTokenPrice(token);
        CollateralToken memory ct = collateralTokens[token];
        uint256 collateralDecimals = 10 ** ct.decimals;

        // collateralToSeize = (debtToCover * (100 + bonus) / 100) / collateralPriceUSD
        uint256 collateralToSeize = (debtToCover * (RATIO_DENOMINATOR + LIQUIDATION_BONUS) * collateralDecimals)
            / (RATIO_DENOMINATOR * collateralPrice);

        uint256 available = collateralDeposits[user][token];
        if (collateralToSeize > available) collateralToSeize = available;

        // State updates
        susdDebt[user]                     -= debtToCover;
        collateralDeposits[user][token]    -= collateralToSeize;

        // Burn the repaid SUSD from liquidator
        susd.burn(msg.sender, debtToCover);

        // Transfer seized collateral to liquidator
        if (token == address(0)) {
            (bool ok,) = msg.sender.call{value: collateralToSeize}("");
            require(ok, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(msg.sender, collateralToSeize);
        }

        emit Liquidated(msg.sender, user, token, debtToCover, collateralToSeize);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Returns the collateral ratio (%) of a user across all tokens.
    function collateralRatioOf(address user) external view returns (uint256) {
        return _collateralRatio(user);
    }

    /// @notice Returns the total USD value of a user's collateral (18 decimals).
    function collateralValueOf(address user) external view returns (uint256) {
        return _totalCollateralValueUSD(user);
    }

    /// @notice Returns all supported collateral token addresses.
    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _depositCollateral(address token, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (!collateralTokens[token].enabled) revert TokenNotSupported();

        collateralDeposits[msg.sender][token] += amount;
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit CollateralDeposited(msg.sender, token, amount);
    }

    function _depositETH() internal {
        if (msg.value == 0) revert ZeroAmount();
        // ETH is stored under address(0) as a pseudo-token key
        if (!collateralTokens[address(0)].enabled) revert TokenNotSupported();

        collateralDeposits[msg.sender][address(0)] += msg.value;
        emit CollateralDeposited(msg.sender, address(0), msg.value);
    }

    function _withdrawCollateral(address token, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (collateralDeposits[msg.sender][token] < amount) revert InsufficientCollateral();

        collateralDeposits[msg.sender][token] -= amount;

        _requireHealthyRatio(msg.sender);

        if (token == address(0)) {
            (bool ok,) = msg.sender.call{value: amount}("");
            require(ok, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }
        emit CollateralWithdrawn(msg.sender, token, amount);
    }

    function _mintSUSD(uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        susdDebt[msg.sender] += amount;
        _requireHealthyRatio(msg.sender);
        susd.mint(msg.sender, amount);
        emit SUSDMinted(msg.sender, amount);
    }

    function _burnSUSD(uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        uint256 debt = susdDebt[msg.sender];
        if (amount > debt) revert ExceedsDebt();

        susdDebt[msg.sender] -= amount;
        susd.burn(msg.sender, amount);
        emit SUSDBurned(msg.sender, amount);
    }

    function _requireHealthyRatio(address user) internal view {
        if (susdDebt[user] > 0) {
            if (_collateralRatio(user) < MIN_COLLATERAL_RATIO) {
                revert BelowMinCollateralRatio();
            }
        }
    }

    /// @dev Returns collateral ratio in percent (e.g. 150 = 150 %).
    function _collateralRatio(address user) internal view returns (uint256) {
        uint256 debt = susdDebt[user];
        if (debt == 0) return type(uint256).max;

        uint256 collateralUSD = _totalCollateralValueUSD(user);
        // collateralUSD is 18-decimal, debt is 18-decimal
        return (collateralUSD * RATIO_DENOMINATOR) / debt;
    }

    /// @dev Sums up USD value of all collateral held by `user` (result: 18 decimals).
    function _totalCollateralValueUSD(address user) internal view returns (uint256 totalUSD) {
        uint256 len = supportedTokens.length;
        for (uint256 i; i < len; ++i) {
            address token = supportedTokens[i];
            uint256 deposited = collateralDeposits[user][token];
            if (deposited == 0) continue;

            uint256 price    = _getTokenPrice(token);         // 8 decimals (Chainlink)
            uint256 decimals = 10 ** collateralTokens[token].decimals;
            // Normalise to 18 decimals: deposited * price / (tokenDecimals * 1e8) * 1e18
            totalUSD += (deposited * price * PRECISION) / (decimals * 1e8);
        }

        // ETH collateral (stored under address(0))
        uint256 ethDeposited = collateralDeposits[user][address(0)];
        if (ethDeposited > 0) {
            uint256 ethPrice = _getTokenPrice(address(0)); // 8 decimals
            totalUSD += (ethDeposited * ethPrice * PRECISION) / (1e18 * 1e8);
        }
    }

    /// @dev Fetches latest price from Chainlink Data Feed.  Returns 8-decimal USD price.
    function _getTokenPrice(address token) internal view returns (uint256) {
        address feedAddr = collateralTokens[token].priceFeed;
        AggregatorV3Interface feed = AggregatorV3Interface(feedAddr);

        (
            uint80 roundId,
            int256  price,
            ,
            uint256 updatedAt,
            uint80  answeredInRound
        ) = feed.latestRoundData();

        if (price <= 0) revert InvalidPrice();
        if (answeredInRound < roundId) revert StalePrice();
        if (updatedAt == 0) revert StalePrice();

        return uint256(price);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Receive ETH
    // ─────────────────────────────────────────────────────────────────────────
    receive() external payable {}
}
