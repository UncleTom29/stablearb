// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {SUSD} from "../src/SUSD.sol";
import {CrossChainBuyback} from "../src/CrossChainBuyback.sol";
import {Client} from "@ccip/contracts/src/v0.8/ccip/libraries/Client.sol";

/// @notice Mock CCIP Router for testing.
contract MockCCIPRouter {
    bytes32 public lastMessageId = keccak256("mockMessageId");
    uint256 public feeAmount = 1e15; // 0.001 ETH

    function getFee(uint64, Client.EVM2AnyMessage calldata)
        external
        view
        returns (uint256)
    {
        return feeAmount;
    }

    function ccipSend(uint64, Client.EVM2AnyMessage calldata)
        external
        payable
        returns (bytes32)
    {
        return lastMessageId;
    }

    function setFee(uint256 _fee) external {
        feeAmount = _fee;
    }
}

/// @notice Mock ERC-20 (LINK).
contract MockLink {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        return true;
    }
}

contract CrossChainBuybackTest is Test {
    SUSD               public susd;
    CrossChainBuyback  public buyback;
    MockCCIPRouter     public router;
    MockLink           public link;

    address owner     = address(this);
    address recipient = address(0xBEEF);

    uint64  constant DEST_CHAIN   = 3478487238524512106;
    uint64  constant SOURCE_CHAIN = 16015286601757825753;

    function setUp() public {
        susd    = new SUSD();
        router  = new MockCCIPRouter();
        link    = new MockLink();

        buyback = new CrossChainBuyback(
            address(router),
            address(link),
            address(susd)
        );

        // Set destination
        buyback.setDestination(DEST_CHAIN, address(buyback));
        // Allow this contract's buyback as source for ccipReceive
        buyback.setAllowedSource(SOURCE_CHAIN, address(buyback));

        // Authorise buyback as vault
        susd.setVault(address(buyback));
    }

    // ─── sendAction ───────────────────────────────────────────────────────

    function test_SendBuybackInNative() public {
        vm.deal(address(this), 1 ether);
        bytes32 msgId = buyback.sendAction{value: 0.01 ether}(
            CrossChainBuyback.ActionType.BUYBACK,
            1000e18,
            address(0),
            false // pay in native
        );
        assertEq(msgId, router.lastMessageId());
    }

    function test_SendMintInLink() public {
        link.mint(address(this), 5e18);
        link.approve(address(buyback), 5e18);

        bytes32 msgId = buyback.sendAction(
            CrossChainBuyback.ActionType.MINT,
            500e18,
            recipient,
            true // pay in LINK
        );
        assertEq(msgId, router.lastMessageId());
    }

    function test_RevertIfInsufficientNativeFee() public {
        vm.expectRevert(CrossChainBuyback.InsufficientFee.selector);
        buyback.sendAction{value: 0}(
            CrossChainBuyback.ActionType.BUYBACK,
            100e18,
            address(0),
            false
        );
    }

    // ─── ccipReceive ──────────────────────────────────────────────────────

    function test_ReceiveMint() public {
        Client.Any2EVMMessage memory message = _buildMessage(
            CrossChainBuyback.ActionType.MINT,
            200e18,
            recipient
        );

        // Simulate call from CCIP router
        vm.prank(address(router));
        buyback.ccipReceive(message);

        assertEq(susd.balanceOf(recipient), 200e18);
    }

    function test_ReceiveBuyback() public {
        // Pre-mint SUSD into the buyback contract (simulating pre-funded treasury)
        susd.mint(address(buyback), 300e18);

        Client.Any2EVMMessage memory message = _buildMessage(
            CrossChainBuyback.ActionType.BUYBACK,
            300e18,
            address(0)
        );

        vm.prank(address(router));
        buyback.ccipReceive(message);

        assertEq(susd.balanceOf(address(buyback)), 0);
    }

    function test_RevertUnauthorisedSender() public {
        Client.Any2EVMMessage memory message = _buildMessage(
            CrossChainBuyback.ActionType.MINT,
            100e18,
            recipient
        );

        // Attacker tries to call ccipReceive directly (not through router)
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        buyback.ccipReceive(message);
    }

    function test_RevertUnauthorisedSourceChain() public {
        // Build message from unlisted source chain
        Client.Any2EVMMessage memory message;
        message.messageId         = keccak256("test");
        message.sourceChainSelector = 999; // unlisted chain
        message.sender            = abi.encode(address(buyback));
        message.data              = abi.encode(
            CrossChainBuyback.CrossChainAction({
                actionType: CrossChainBuyback.ActionType.MINT,
                amount:     100e18,
                recipient:  recipient
            })
        );
        message.destTokenAmounts  = new Client.EVMTokenAmount[](0);

        vm.prank(address(router));
        vm.expectRevert();
        buyback.ccipReceive(message);
    }

    // ─── Admin ────────────────────────────────────────────────────────────

    function test_SetAllowedSource() public {
        buyback.setAllowedSource(12345, address(0x1234));
        assertEq(buyback.allowedSources(12345), address(0x1234));
    }

    function test_SetDestination() public {
        buyback.setDestination(DEST_CHAIN, address(0x9999));
        assertEq(buyback.destReceiver(), address(0x9999));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    function _buildMessage(
        CrossChainBuyback.ActionType actionType,
        uint256 amount,
        address _recipient
    ) internal view returns (Client.Any2EVMMessage memory) {
        Client.Any2EVMMessage memory message;
        message.messageId           = keccak256("test");
        message.sourceChainSelector = SOURCE_CHAIN;
        message.sender              = abi.encode(address(buyback));
        message.data                = abi.encode(
            CrossChainBuyback.CrossChainAction({
                actionType: actionType,
                amount:     amount,
                recipient:  _recipient
            })
        );
        message.destTokenAmounts = new Client.EVMTokenAmount[](0);
        return message;
    }
}
