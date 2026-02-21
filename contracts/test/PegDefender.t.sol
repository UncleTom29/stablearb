// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {SUSD} from "../src/SUSD.sol";
import {PegDefender} from "../src/PegDefender.sol";
import {IVerifierProxy} from "../src/interfaces/IVerifierProxy.sol";

/// @notice Minimal mock verifier that returns a pre-baked report.
contract MockVerifier {
    bytes public returnData;

    function setReturnData(bytes calldata data) external {
        returnData = data;
    }

    function verify(bytes calldata, bytes calldata)
        external
        payable
        returns (bytes memory)
    {
        return returnData;
    }

    function s_feeManager() external pure returns (address) {
        return address(0);
    }
}

/// @notice Mock ERC-20 (LINK).
contract MockERC20 {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address, uint256) external pure returns (bool) {
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

/// @notice Mock push oracle (returns a configurable price).
contract MockFallbackFeed {
    int256  public price;
    uint256 public updatedAt;

    constructor(int256 _price) {
        price     = _price;
        updatedAt = block.timestamp;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, price, block.timestamp, updatedAt, 1);
    }

    function setPrice(int256 _p) external {
        price     = _p;
        updatedAt = block.timestamp;
    }
}

contract PegDefenderTest is Test {
    SUSD           public susd;
    PegDefender    public defender;
    MockVerifier   public verifier;
    MockERC20      public link;
    MockFallbackFeed public fallbackFeed;

    address treasury = address(0x7EA5);

    bytes32 constant SUSD_FEED = bytes32(uint256(keccak256("SUSD/USD")));
    bytes32 constant ETH_FEED  = 0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782;

    function setUp() public {
        susd        = new SUSD();
        verifier    = new MockVerifier();
        link        = new MockERC20();
        // Push feed at exactly $1.00 (8 dec) → normalised to $1.00 (18 dec)
        fallbackFeed = new MockFallbackFeed(1e8);

        defender = new PegDefender(
            address(verifier),
            address(susd),
            address(link),
            address(fallbackFeed),
            treasury,
            SUSD_FEED,
            ETH_FEED
        );

        // Authorise defender as vault so it can mint/burn
        susd.setVault(address(defender));
    }

    // ─── Fallback path ────────────────────────────────────────────────────

    function test_FallbackNoActionAtPeg() public {
        // Price is $1.00 (at peg) → no action
        defender.toggleDataStreams(false);

        bytes memory performData = abi.encode(uint256(1e18), false);
        defender.performUpkeep(performData);

        assertEq(susd.totalSupply(), 0);
    }

    function test_FallbackMintWhenAbovePeg() public {
        // Push SUSD price to $1.01 (18 dec)
        uint256 abovePegPrice = 101e16; // $1.01

        defender.toggleDataStreams(false);

        bytes memory performData = abi.encode(abovePegPrice, false);
        defender.performUpkeep(performData);

        // Treasury should have received minted SUSD
        assertGt(susd.balanceOf(treasury), 0);
    }

    function test_FallbackBuybackWhenBelowPeg() public {
        // Pre-fund treasury with SUSD to burn
        susd.mint(treasury, 100e18);

        // Approve defender to burn from treasury
        vm.prank(treasury);
        // (no approval needed — burn is called by vault/defender directly)

        uint256 belowPegPrice = 990e15; // $0.990

        defender.toggleDataStreams(false);

        bytes memory performData = abi.encode(belowPegPrice, false);
        defender.performUpkeep(performData);

        // Treasury SUSD balance should have decreased
        assertLt(susd.balanceOf(treasury), 100e18);
    }

    // ─── Cooldown ─────────────────────────────────────────────────────────

    function test_RevertIfCooldownNotElapsed() public {
        defender.toggleDataStreams(false);
        uint256 belowPegPrice = 990e15;
        susd.mint(treasury, 100e18);

        bytes memory performData = abi.encode(belowPegPrice, false);
        defender.performUpkeep(performData);

        // Second call within cooldown
        vm.expectRevert(PegDefender.CooldownNotElapsed.selector);
        defender.performUpkeep(performData);
    }

    function test_ActionAfterCooldown() public {
        defender.toggleDataStreams(false);
        uint256 belowPegPrice = 990e15;
        susd.mint(treasury, 200e18);

        bytes memory performData = abi.encode(belowPegPrice, false);
        defender.performUpkeep(performData);

        // Advance time past cooldown (5 minutes)
        vm.warp(block.timestamp + 6 minutes);
        defender.performUpkeep(performData);
        // No revert — second action succeeded
    }

    // ─── Admin ────────────────────────────────────────────────────────────

    function test_SetTreasury() public {
        address newTreasury = address(0x1234);
        defender.setTreasury(newTreasury);
        assertEq(defender.treasury(), newTreasury);
    }

    function test_RevertSetTreasuryZero() public {
        vm.expectRevert(PegDefender.ZeroAddress.selector);
        defender.setTreasury(address(0));
    }

    function test_SetMaxActionAmount() public {
        defender.setMaxActionAmount(500e18);
        assertEq(defender.maxActionAmount(), 500e18);
    }

    function test_SetCooldown() public {
        defender.setCooldown(10 minutes);
        assertEq(defender.cooldown(), 10 minutes);
    }
}
