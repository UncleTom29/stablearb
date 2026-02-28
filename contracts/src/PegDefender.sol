// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AutomationCompatibleInterface} from
    "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";
import {StreamsLookupCompatibleInterface} from
    "@chainlink/contracts/src/v0.8/automation/interfaces/StreamsLookupCompatibleInterface.sol";
import {AggregatorV3Interface} from
    "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {IVerifierProxy} from "./interfaces/IVerifierProxy.sol";
import {SUSD} from "./SUSD.sol";

/// @title PegDefender
/// @notice Chainlink Automation upkeep that uses Data Streams (StreamsLookup) to monitor
///         the SUSD/USD price and trigger peg-defense actions:
///         • price < $0.995 → buy back SUSD (burn supply) to push price up
///         • price > $1.005 → mint SUSD to sell pressure to push price down
///         Fallback to Chainlink push feed when Data Streams are unavailable.
contract PegDefender is
    Ownable,
    ReentrancyGuard,
    AutomationCompatibleInterface,
    StreamsLookupCompatibleInterface
{
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    // Data Streams report schema (v3)
    // ─────────────────────────────────────────────────────────────────────────

    struct BasicReport {
        bytes32 feedId;            // Feed ID
        uint32  validFromTimestamp;
        uint32  observationsTimestamp;
        uint192 nativeFee;         // Fee in native (wei)
        uint192 linkFee;           // Fee in LINK
        uint32  expiresAt;
        int192  price;             // Median price (18 decimals)
        int192  bid;
        int192  ask;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────────

    uint256 public constant PEG_TARGET    = 1e18;         // $1.00  (18 dec)
    uint256 public constant PEG_LOWER     = 995e15;       // $0.995 (18 dec)
    uint256 public constant PEG_UPPER     = 1005e15;      // $1.005 (18 dec)
    uint256 public constant PRICE_SCALE   = 1e18;

    string  public constant STREAMS_LOOKUP_ERROR = "StreamsLookupError";
    string  public constant DATA_STREAMS_FEED_LABEL = "feedIDs";

    // ─────────────────────────────────────────────────────────────────────────
    // Immutables
    // ─────────────────────────────────────────────────────────────────────────

    IVerifierProxy  public immutable verifierProxy;
    SUSD            public immutable susd;
    IERC20          public immutable link;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    bytes32 public susdFeedId;       // Data Streams feed ID for SUSD/USD
    bytes32 public ethFeedId;        // Data Streams feed ID for ETH/USD (reference)
    AggregatorV3Interface public fallbackFeed; // Push-oracle fallback

    // Treasury that receives minted SUSD or provides buyback liquidity
    address public treasury;

    // Maximum SUSD to mint/burn per peg-defense event
    uint256 public maxActionAmount = 10_000e18; // 10 000 SUSD

    // Cooldown between peg-defense events (seconds)
    uint256 public cooldown = 5 minutes;
    uint256 public lastActionTimestamp;

    // Use Data Streams (true) or fallback push feed (false)
    bool public useDataStreams = true;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event PegDefenseTriggered(string actionType, uint256 price, uint256 amount);
    event FallbackUsed(uint256 price);
    event TreasurySet(address indexed treasury);
    event FeedIdSet(bytes32 susdFeedId, bytes32 ethFeedId);
    event MaxActionAmountSet(uint256 amount);
    event CooldownSet(uint256 seconds_);
    event DataStreamsToggled(bool enabled);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error ZeroAddress();
    error CooldownNotElapsed();
    error InvalidReport();
    error StaleReport();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(
        address _verifierProxy,
        address _susd,
        address _link,
        address _fallbackFeed,
        address _treasury,
        bytes32 _susdFeedId,
        bytes32 _ethFeedId
    ) Ownable(msg.sender) {
        if (_verifierProxy == address(0) || _susd == address(0) || _link == address(0)) {
            revert ZeroAddress();
        }
        verifierProxy = IVerifierProxy(_verifierProxy);
        susd          = SUSD(_susd);
        link          = IERC20(_link);
        fallbackFeed  = AggregatorV3Interface(_fallbackFeed);
        treasury      = _treasury;
        susdFeedId    = _susdFeedId;
        ethFeedId     = _ethFeedId;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Chainlink Automation — checkUpkeep
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc AutomationCompatibleInterface
    /// @dev Triggers a StreamsLookup revert which tells the Automation DON to
    ///      fetch the Data Streams report, then calls performUpkeep with it.
    function checkUpkeep(
        bytes calldata /* checkData */
    ) external view override returns (bool upkeepNeeded, bytes memory performData) {
        if (block.timestamp < lastActionTimestamp + cooldown) {
            return (false, "");
        }

        if (useDataStreams) {
            // Trigger off-chain Data Streams fetch via StreamsLookup
            string[] memory feeds = new string[](1);
            feeds[0] = _bytes32ToHexString(susdFeedId);

            // solhint-disable-next-line custom-errors
            revert StreamsLookup(
                DATA_STREAMS_FEED_LABEL,
                feeds,
                "timestamp",
                block.timestamp,
                ""
            );
        }

        // Fallback: use push oracle
        uint256 price = _getFallbackPrice();
        upkeepNeeded  = (price < PEG_LOWER || price > PEG_UPPER);
        performData   = abi.encode(price, false);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Chainlink Automation — checkErrorHandler (StreamsLookupCompatible)
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc StreamsLookupCompatibleInterface
    function checkErrorHandler(
        uint256 /* errorCode */,
        bytes calldata /* extraData */
    ) external view override returns (bool upkeepNeeded, bytes memory performData) {
        // On Data Streams error, fall back to push oracle
        uint256 price = _getFallbackPrice();
        upkeepNeeded  = (price < PEG_LOWER || price > PEG_UPPER);
        performData   = abi.encode(price, false);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Chainlink Automation — checkCallback (StreamsLookupCompatible)
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc StreamsLookupCompatibleInterface
    function checkCallback(
        bytes[] memory values,
        bytes memory /* extraData */
    ) external pure override returns (bool upkeepNeeded, bytes memory performData) {
        if (values.length == 0) return (false, "");
        // Re-encode for performUpkeep: (bytes[] values, bytes extraData)
        performData  = abi.encode(values, bytes(""));
        upkeepNeeded = true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Chainlink Automation — performUpkeep
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc AutomationCompatibleInterface
    /// @param performData ABI-encoded: (bytes[] values, bytes extraData) from StreamsLookup
    ///                   OR (uint256 fallbackPrice, bool isFallback) from checkErrorHandler.
    function performUpkeep(bytes calldata performData) external override nonReentrant {
        if (block.timestamp < lastActionTimestamp + cooldown) revert CooldownNotElapsed();

        uint256 susdPrice;

        // Try to decode as Data Streams callback (bytes[], bytes)
        (bool isStreams, bytes[] memory values) = _tryDecodeStreams(performData);

        if (isStreams && values.length > 0) {
            // Verify the report and extract the price
            susdPrice = _verifyAndExtractPrice(values[0]);
        } else {
            // Decode fallback (uint256 price, bool isFallback)
            (uint256 fallbackPrice,) = abi.decode(performData, (uint256, bool));
            susdPrice = fallbackPrice;
            emit FallbackUsed(susdPrice);
        }

        _executePegDefense(susdPrice);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal — peg defense logic
    // ─────────────────────────────────────────────────────────────────────────

    function _executePegDefense(uint256 susdPrice) internal {
        lastActionTimestamp = block.timestamp;

        if (susdPrice < PEG_LOWER) {
            // Peg below → buy back SUSD (burn supply) to reduce circulating supply
            uint256 amount = _calcDefenseAmount(susdPrice);
            // Treasury must hold SUSD to burn; vault must authorise this contract
            susd.burn(treasury, amount);
            emit PegDefenseTriggered("BUYBACK", susdPrice, amount);
        } else if (susdPrice > PEG_UPPER) {
            // Peg above → mint SUSD and send to treasury to increase supply
            uint256 amount = _calcDefenseAmount(susdPrice);
            susd.mint(treasury, amount);
            emit PegDefenseTriggered("MINT", susdPrice, amount);
        }
        // Within band → no action needed
    }

    /// @dev Scales the defense amount proportionally to the deviation from peg.
    function _calcDefenseAmount(uint256 price) internal view returns (uint256) {
        uint256 deviation;
        if (price < PEG_TARGET) {
            deviation = PEG_TARGET - price;
        } else {
            deviation = price - PEG_TARGET;
        }
        // amount = maxActionAmount * deviation / PEG_TARGET
        uint256 amount = (maxActionAmount * deviation) / PEG_TARGET;
        return amount > maxActionAmount ? maxActionAmount : amount;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal — Data Streams helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _verifyAndExtractPrice(bytes memory signedReport)
        internal
        returns (uint256 price)
    {
        // Pay verification fee in native (ETH).
        bytes memory verifierResponse = verifierProxy.verify{value: address(this).balance > 0 ? 0 : 0}(
            signedReport,
            abi.encode(address(link)) // quote in LINK
        );

        BasicReport memory report = abi.decode(verifierResponse, (BasicReport));

        if (report.feedId != susdFeedId) revert InvalidReport();
        if (report.expiresAt < block.timestamp) revert StaleReport();
        if (report.price <= 0) revert InvalidReport();

        // price is 18-decimal in the BasicReport
        price = uint256(int256(report.price));
    }

    /// @dev Attempts to decode performData as a StreamsLookup callback (bytes[], bytes).
    function _tryDecodeStreams(bytes calldata data)
        internal
        view
        returns (bool success, bytes[] memory values)
    {
        try this._decodeStreams(data) returns (bytes[] memory v, bytes memory) {
            return (true, v);
        } catch {
            return (false, new bytes[](0));
        }
    }

    /// @dev External wrapper so _tryDecodeStreams can use try/catch.
    function _decodeStreams(bytes calldata data)
        external
        pure
        returns (bytes[] memory values, bytes memory extraData)
    {
        (values, extraData) = abi.decode(data, (bytes[], bytes));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal — fallback push oracle
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Encodes a bytes32 feed ID as a "0x..." hex string for StreamsLookup.
    function _bytes32ToHexString(bytes32 value) internal pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory result   = new bytes(66); // "0x" + 64 hex chars
        result[0] = "0";
        result[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            result[2 + i * 2]     = hexChars[uint8(value[i] >> 4)];
            result[3 + i * 2]     = hexChars[uint8(value[i] & 0x0f)];
        }
        return string(result);
    }

    function _getFallbackPrice() internal view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = fallbackFeed.latestRoundData();
        if (answer <= 0) return PEG_TARGET; // Treat as at-peg on error
        if (block.timestamp - updatedAt > 3600) return PEG_TARGET; // Stale → at-peg

        // Chainlink push feed returns 8-decimal price; normalise to 18 decimals
        return uint256(answer) * 1e10;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    function setFeedIds(bytes32 _susdFeedId, bytes32 _ethFeedId) external onlyOwner {
        susdFeedId = _susdFeedId;
        ethFeedId  = _ethFeedId;
        emit FeedIdSet(_susdFeedId, _ethFeedId);
    }

    function setMaxActionAmount(uint256 _amount) external onlyOwner {
        maxActionAmount = _amount;
        emit MaxActionAmountSet(_amount);
    }

    function setCooldown(uint256 _seconds) external onlyOwner {
        cooldown = _seconds;
        emit CooldownSet(_seconds);
    }

    function toggleDataStreams(bool _use) external onlyOwner {
        useDataStreams = _use;
        emit DataStreamsToggled(_use);
    }

    function setFallbackFeed(address _feed) external onlyOwner {
        if (_feed == address(0)) revert ZeroAddress();
        fallbackFeed = AggregatorV3Interface(_feed);
    }

    function withdrawLink() external onlyOwner {
        uint256 balance = link.balanceOf(address(this));
        link.safeTransfer(owner(), balance);
    }

    receive() external payable {}
}
