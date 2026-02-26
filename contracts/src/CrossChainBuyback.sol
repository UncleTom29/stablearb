// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAny2EVMMessageReceiver} from
    "@chainlink/contracts-ccip/contracts/interfaces/IAny2EVMMessageReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {SUSD} from "./SUSD.sol";

/// @title CrossChainBuyback
/// @notice CCIP receiver + sender for cross-chain peg-defense.
///         On the *source* chain (Sepolia) it dispatches a CCIP message to the
///         destination chain (Arbitrum Sepolia).
///         On the *destination* chain (Arbitrum Sepolia) it receives the message
///         and executes the buyback (burn SUSD) or mint action.
contract CrossChainBuyback is Ownable, ReentrancyGuard, IAny2EVMMessageReceiver {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    enum ActionType { BUYBACK, MINT }

    struct CrossChainAction {
        ActionType actionType;
        uint256    amount;
        address    recipient; // relevant for MINT action
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Immutables
    // ─────────────────────────────────────────────────────────────────────────

    IRouterClient public immutable ccipRouter;
    IERC20        public immutable link;
    SUSD          public immutable susd;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    // Authorised source chain selectors + senders
    mapping(uint64 chainSelector => address sender) public allowedSources;

    // Default destination chain configuration
    uint64  public destChainSelector;
    address public destReceiver;

    // Gas limit for the CCIP receive call on destination
    uint256 public ccipGasLimit = 200_000;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event CrossChainActionSent(
        bytes32 indexed messageId,
        uint64  indexed destChainSelector,
        ActionType actionType,
        uint256    amount
    );
    event CrossChainActionReceived(
        bytes32    indexed messageId,
        uint64     indexed sourceChainSelector,
        ActionType actionType,
        uint256    amount
    );
    event AllowedSourceSet(uint64 chainSelector, address sender);
    event DestinationSet(uint64 chainSelector, address receiver);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error ZeroAddress();
    error UnauthorisedSource(uint64 chainSelector, address sender);
    error InvalidAction();
    error InsufficientFee();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(
        address _ccipRouter,
        address _link,
        address _susd
    ) Ownable(msg.sender) {
        if (_ccipRouter == address(0) || _link == address(0) || _susd == address(0)) {
            revert ZeroAddress();
        }
        ccipRouter = IRouterClient(_ccipRouter);
        link       = IERC20(_link);
        susd       = SUSD(_susd);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Send cross-chain action (source chain)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Dispatch a peg-defense action to the destination chain via CCIP.
    ///         Fees are paid in LINK (pre-approved by caller) or native ETH.
    /// @param actionType BUYBACK or MINT
    /// @param amount     SUSD amount (18 decimals)
    /// @param recipient  Recipient for MINT; ignored for BUYBACK
    /// @param payInLink  true = pay fee in LINK, false = pay in native ETH
    function sendAction(
        ActionType actionType,
        uint256    amount,
        address    recipient,
        bool       payInLink
    ) external payable nonReentrant returns (bytes32 messageId) {
        CrossChainAction memory action = CrossChainAction({
            actionType: actionType,
            amount:     amount,
            recipient:  recipient
        });

        bytes memory payload = abi.encode(action);

        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver:         abi.encode(destReceiver),
            data:             payload,
            tokenAmounts:     new Client.EVMTokenAmount[](0),
            extraArgs:        Client._argsToBytes(
                                  Client.EVMExtraArgsV1({gasLimit: ccipGasLimit})
                              ),
            feeToken:         payInLink ? address(link) : address(0)
        });

        uint256 fee = ccipRouter.getFee(destChainSelector, message);

        if (payInLink) {
            link.safeTransferFrom(msg.sender, address(this), fee);
            link.approve(address(ccipRouter), fee);
            messageId = ccipRouter.ccipSend(destChainSelector, message);
        } else {
            if (msg.value < fee) revert InsufficientFee();
            messageId = ccipRouter.ccipSend{value: fee}(destChainSelector, message);
            // Refund excess
            if (msg.value > fee) {
                (bool ok,) = msg.sender.call{value: msg.value - fee}("");
                require(ok, "ETH refund failed");
            }
        }

        emit CrossChainActionSent(messageId, destChainSelector, actionType, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Receive cross-chain action (destination chain)
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IAny2EVMMessageReceiver
    function ccipReceive(Client.Any2EVMMessage calldata message)
        external
        override
        nonReentrant
    {
        // Only the CCIP router may call this
        if (msg.sender != address(ccipRouter)) {
            revert UnauthorisedSource(0, msg.sender);
        }

        uint64  srcChain  = message.sourceChainSelector;
        address srcSender = abi.decode(message.sender, (address));

        address allowed = allowedSources[srcChain];
        if (allowed == address(0) || allowed != srcSender) {
            revert UnauthorisedSource(srcChain, srcSender);
        }

        CrossChainAction memory action = abi.decode(message.data, (CrossChainAction));

        if (action.actionType == ActionType.BUYBACK) {
            // Burn SUSD from this contract's balance (pre-funded by treasury)
            susd.burn(address(this), action.amount);
        } else if (action.actionType == ActionType.MINT) {
            susd.mint(
                action.recipient != address(0) ? action.recipient : address(this),
                action.amount
            );
        } else {
            revert InvalidAction();
        }

        emit CrossChainActionReceived(
            message.messageId,
            srcChain,
            action.actionType,
            action.amount
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function setAllowedSource(uint64 chainSelector, address sender) external onlyOwner {
        allowedSources[chainSelector] = sender;
        emit AllowedSourceSet(chainSelector, sender);
    }

    function setDestination(uint64 chainSelector, address receiver) external onlyOwner {
        if (receiver == address(0)) revert ZeroAddress();
        destChainSelector = chainSelector;
        destReceiver      = receiver;
        emit DestinationSet(chainSelector, receiver);
    }

    function setCcipGasLimit(uint256 gasLimit) external onlyOwner {
        ccipGasLimit = gasLimit;
    }

    function withdrawLink() external onlyOwner {
        uint256 bal = link.balanceOf(address(this));
        link.safeTransfer(owner(), bal);
    }

    function withdrawNative() external onlyOwner {
        (bool ok,) = owner().call{value: address(this).balance}("");
        require(ok, "ETH transfer failed");
    }

    receive() external payable {}
}
