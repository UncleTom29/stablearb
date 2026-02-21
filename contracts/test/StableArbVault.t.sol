// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {SUSD} from "../src/SUSD.sol";
import {StableArbVault} from "../src/StableArbVault.sol";

/// @notice Mock Chainlink AggregatorV3 price feed for testing.
contract MockPriceFeed {
    int256  public price;
    uint8   public decimals_ = 8;
    uint80  public roundId   = 1;
    uint256 public updatedAt;

    constructor(int256 _price) {
        price     = _price;
        updatedAt = block.timestamp;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80  _roundId,
            int256  _answer,
            uint256 _startedAt,
            uint256 _updatedAt,
            uint80  _answeredInRound
        )
    {
        return (roundId, price, block.timestamp, updatedAt, roundId);
    }

    function setPrice(int256 _price) external {
        price     = _price;
        updatedAt = block.timestamp;
    }
}

contract StableArbVaultTest is Test {
    SUSD            public susd;
    StableArbVault  public vault;
    MockPriceFeed   public ethFeed;

    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    // ETH price = $2 000 (8 decimals)
    int256 constant ETH_PRICE = 2000e8;

    function setUp() public {
        susd     = new SUSD();
        vault    = new StableArbVault(address(susd));
        ethFeed  = new MockPriceFeed(ETH_PRICE);

        // Authorise vault
        susd.setVault(address(vault));

        // Register ETH as collateral
        vault.addCollateralToken(address(0), address(ethFeed), 18);
    }

    // ─── Deposit ETH ──────────────────────────────────────────────────────

    function test_DepositETH() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vault.depositETHAndMint{value: 1 ether}(0);

        assertEq(vault.collateralDeposits(alice, address(0)), 1 ether);
        assertEq(vault.susdDebt(alice), 0);
    }

    function test_DepositETHAndMint() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        // Deposit 1 ETH ($2000), mint 1000 SUSD → 200 % ratio
        vault.depositETHAndMint{value: 1 ether}(1000e18);

        assertEq(susd.balanceOf(alice), 1000e18);
        assertEq(vault.susdDebt(alice), 1000e18);
    }

    function test_RevertIfBelowMinRatio() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        // 1 ETH = $2000; 150 % min ratio → max mintable = 2000 / 1.5 = $1333
        // Try to mint $1500 → should revert
        vm.expectRevert(StableArbVault.BelowMinCollateralRatio.selector);
        vault.depositETHAndMint{value: 1 ether}(1500e18);
    }

    // ─── Collateral ratio ─────────────────────────────────────────────────

    function test_CollateralRatio() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vault.depositETHAndMint{value: 1 ether}(1000e18);

        // 1 ETH @ $2000 / 1000 SUSD = 200 %
        assertEq(vault.collateralRatioOf(alice), 200);
    }

    function test_CollateralRatioInfiniteWhenNoDebt() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vault.depositETHAndMint{value: 1 ether}(0);
        assertEq(vault.collateralRatioOf(alice), type(uint256).max);
    }

    // ─── Burn & withdraw ──────────────────────────────────────────────────

    function test_BurnAndWithdraw() public {
        vm.deal(alice, 10 ether);
        vm.startPrank(alice);
        vault.depositETHAndMint{value: 1 ether}(1000e18);

        // Approve vault to burn SUSD (burn from user balance)
        susd.approve(address(vault), 1000e18);
        vault.burnAndWithdraw(1000e18, address(0), 0.5 ether);
        vm.stopPrank();

        assertEq(susd.balanceOf(alice), 0);
        assertEq(vault.susdDebt(alice), 0);
        assertEq(vault.collateralDeposits(alice, address(0)), 0.5 ether);
    }

    function test_RevertWithdrawBelowRatio() public {
        vm.deal(alice, 10 ether);
        vm.startPrank(alice);
        vault.depositETHAndMint{value: 1 ether}(1000e18);

        // Try to withdraw 0.9 ETH while 1000 SUSD debt remains
        // 0.1 ETH * $2000 = $200 / 1000 SUSD = 20 % → below 150 %
        vm.expectRevert(StableArbVault.BelowMinCollateralRatio.selector);
        vault.burnAndWithdraw(0, address(0), 0.9 ether);
        vm.stopPrank();
    }

    // ─── Liquidation ──────────────────────────────────────────────────────

    function test_Liquidation() public {
        // Setup alice position
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vault.depositETHAndMint{value: 1 ether}(1000e18);

        // ETH price drops to $1000 → ratio = 100 % (below 120 %)
        ethFeed.setPrice(1000e8);

        // Bob liquidates alice's position
        vm.deal(bob, 1 ether);
        deal(address(susd), bob, 1000e18);

        uint256 bobEthBefore = bob.balance;

        vm.startPrank(bob);
        susd.approve(address(vault), 1000e18);
        vault.liquidate(alice, address(0), 500e18);
        vm.stopPrank();

        // Bob should have received collateral
        assertGt(bob.balance, bobEthBefore);
        // Alice debt reduced
        assertEq(vault.susdDebt(alice), 500e18);
    }

    function test_RevertLiquidationAboveRatio() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vault.depositETHAndMint{value: 1 ether}(1000e18);

        // Ratio is 200 % → above liquidation threshold
        vm.prank(bob);
        vm.expectRevert(StableArbVault.AboveLiquidationRatio.selector);
        vault.liquidate(alice, address(0), 100e18);
    }

    // ─── Admin ────────────────────────────────────────────────────────────

    function test_AddCollateralToken() public {
        address newToken = address(0xDEAD);
        MockPriceFeed feed = new MockPriceFeed(50_000e8);
        vault.addCollateralToken(newToken, address(feed), 8);

        (address pf, uint8 dec, bool enabled) = _getToken(newToken);
        assertEq(pf, address(feed));
        assertEq(dec, 8);
        assertTrue(enabled);
    }

    function test_RevertAddTokenZeroAddress() public {
        vm.expectRevert(StableArbVault.ZeroAddress.selector);
        vault.addCollateralToken(address(0), address(0), 18);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    function _getToken(address t)
        internal
        view
        returns (address priceFeed, uint8 decimals, bool enabled)
    {
        StableArbVault.CollateralToken memory ct = _vaultToken(t);
        return (ct.priceFeed, ct.decimals, ct.enabled);
    }

    function _vaultToken(address t)
        internal
        view
        returns (StableArbVault.CollateralToken memory)
    {
        (address pf, uint8 dec, bool en) = vault.collateralTokens(t);
        return StableArbVault.CollateralToken({priceFeed: pf, decimals: dec, enabled: en});
    }
}
