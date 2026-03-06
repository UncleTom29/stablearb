// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {SUSD} from "./SUSD.sol";

/// @title IReceiver - receives keystone reports
interface IReceiver is IERC165 {
  function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title PegDefender
/// @notice Chainlink CRE EVM Write consumer that receives SUSD/USD peg defense instructions.
///         Triggered by off-chain CRE Workflows.
contract PegDefender is Ownable, ReentrancyGuard, IReceiver {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    // Constants & State
    // ─────────────────────────────────────────────────────────────────────────

    uint256 public constant PEG_TARGET    = 1e18;         // $1.00  (18 dec)
    uint256 public constant PEG_LOWER     = 995e15;       // $0.995 (18 dec)
    uint256 public constant PEG_UPPER     = 1005e15;      // $1.005 (18 dec)

    SUSD   public immutable susd;
    
    address public treasury;
    address public forwarder; // The Chainlink KeystoneForwarder that delivers reports

    uint256 public lastActionTimestamp;
    uint256 public cooldown = 5 minutes;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event PegDefenseTriggered(string actionType, uint256 price, uint256 amount);
    event TreasurySet(address indexed treasury);
    event ForwarderSet(address indexed forwarder);
    event CooldownSet(uint256 seconds_);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error ZeroAddress();
    error UnauthorizedForwarder();
    error CooldownNotElapsed();
    error InvalidAction();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(
        address _susd,
        address _treasury,
        address _forwarder
    ) Ownable(msg.sender) {
        if (_susd == address(0)) revert ZeroAddress();
        susd      = SUSD(_susd);
        treasury  = _treasury;
        forwarder = _forwarder;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CRE IReceiver
    // ─────────────────────────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    /// @notice Entry point for the CRE Keystone forwarder.
    function onReport(
        bytes calldata /* metadata */,
        bytes calldata report
    ) external override nonReentrant {
        if (msg.sender != forwarder) revert UnauthorizedForwarder();
        if (block.timestamp < lastActionTimestamp + cooldown) revert CooldownNotElapsed();

        // report is strictly encoded by our trusted fully-BFT CRE workflow
        // tuple: (uint256 price, string actionType, uint256 amount)
        (uint256 price, string memory actionType, uint256 amount) = 
            abi.decode(report, (uint256, string, uint256));

        _executePegDefense(price, actionType, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal — peg defense logic
    // ─────────────────────────────────────────────────────────────────────────

    function _executePegDefense(uint256 price, string memory actionType, uint256 amount) internal {
        lastActionTimestamp = block.timestamp;

        // actionType string comparison
        bytes32 actionHash = keccak256(bytes(actionType));

        if (actionHash == keccak256(bytes("BUYBACK"))) {
            // Peg below → buy back SUSD (burn supply) to reduce circulating supply
            susd.burn(treasury, amount);
            emit PegDefenseTriggered("BUYBACK", price, amount);
        } else if (actionHash == keccak256(bytes("MINT"))) {
            // Peg above → mint SUSD and send to treasury to increase supply
            susd.mint(treasury, amount);
            emit PegDefenseTriggered("MINT", price, amount);
        } else if (actionHash == keccak256(bytes("NONE"))) {
            // Explicit no-op 
            emit PegDefenseTriggered("NONE", price, 0);
        } else {
            revert InvalidAction();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    function setForwarder(address _forwarder) external onlyOwner {
        if (_forwarder == address(0)) revert ZeroAddress();
        forwarder = _forwarder;
        emit ForwarderSet(_forwarder);
    }

    function setCooldown(uint256 _seconds) external onlyOwner {
        cooldown = _seconds;
        emit CooldownSet(_seconds);
    }
}
