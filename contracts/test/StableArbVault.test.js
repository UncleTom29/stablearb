const { expect } = require("chai");
const { ethers } = require("hardhat");
const { setBalance } = require("@nomicfoundation/hardhat-network-helpers");

describe("StableArbVault", function () {
  let susd, vault, ethFeed;
  let owner, alice, bob;
  const ETH_PRICE = 2000n * 10n ** 8n; // $2000 with 8 decimals

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const SUSD = await ethers.getContractFactory("SUSD");
    susd = await SUSD.deploy();

    const StableArbVault = await ethers.getContractFactory("StableArbVault");
    vault = await StableArbVault.deploy(await susd.getAddress());

    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    ethFeed = await MockPriceFeed.deploy(ETH_PRICE);

    // Authorise vault
    await susd.setVault(await vault.getAddress());

    // Register ETH as collateral
    await vault.addCollateralToken(ethers.ZeroAddress, await ethFeed.getAddress(), 18);
  });

  describe("Deposit ETH", function () {
    it("should deposit ETH without minting", async function () {
      await vault.connect(alice).depositETHAndMint(0, { value: ethers.parseEther("1") });
      expect(await vault.collateralDeposits(alice.address, ethers.ZeroAddress)).to.equal(ethers.parseEther("1"));
      expect(await vault.susdDebt(alice.address)).to.equal(0n);
    });

    it("should deposit ETH and mint SUSD", async function () {
      await vault.connect(alice).depositETHAndMint(ethers.parseEther("1000"), { value: ethers.parseEther("1") });
      expect(await susd.balanceOf(alice.address)).to.equal(ethers.parseEther("1000"));
      expect(await vault.susdDebt(alice.address)).to.equal(ethers.parseEther("1000"));
    });

    it("should revert if below min collateral ratio", async function () {
      await expect(
        vault.connect(alice).depositETHAndMint(ethers.parseEther("1500"), { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(vault, "BelowMinCollateralRatio");
    });
  });

  describe("Collateral ratio", function () {
    it("should return correct collateral ratio", async function () {
      await vault.connect(alice).depositETHAndMint(ethers.parseEther("1000"), { value: ethers.parseEther("1") });
      expect(await vault.collateralRatioOf(alice.address)).to.equal(200n);
    });

    it("should return max uint256 when no debt", async function () {
      await vault.connect(alice).depositETHAndMint(0, { value: ethers.parseEther("1") });
      expect(await vault.collateralRatioOf(alice.address)).to.equal(ethers.MaxUint256);
    });
  });

  describe("Burn and withdraw", function () {
    it("should burn SUSD and withdraw ETH", async function () {
      await vault.connect(alice).depositETHAndMint(ethers.parseEther("1000"), { value: ethers.parseEther("1") });
      await susd.connect(alice).approve(await vault.getAddress(), ethers.parseEther("1000"));
      await vault.connect(alice).burnAndWithdraw(ethers.parseEther("1000"), ethers.ZeroAddress, ethers.parseEther("0.5"));

      expect(await susd.balanceOf(alice.address)).to.equal(0n);
      expect(await vault.susdDebt(alice.address)).to.equal(0n);
      expect(await vault.collateralDeposits(alice.address, ethers.ZeroAddress)).to.equal(ethers.parseEther("0.5"));
    });

    it("should revert withdrawal that causes undercollateralisation", async function () {
      await vault.connect(alice).depositETHAndMint(ethers.parseEther("1000"), { value: ethers.parseEther("1") });
      await expect(
        vault.connect(alice).burnAndWithdraw(0, ethers.ZeroAddress, ethers.parseEther("0.9"))
      ).to.be.revertedWithCustomError(vault, "BelowMinCollateralRatio");
    });
  });

  describe("Liquidation", function () {
    it("should liquidate undercollateralised position", async function () {
      await vault.connect(alice).depositETHAndMint(ethers.parseEther("1000"), { value: ethers.parseEther("1") });

      // ETH price drops to $1000
      await ethFeed.setPrice(1000n * 10n ** 8n);

      // Give bob SUSD to liquidate with (temporarily set owner as vault to mint)
      await susd.setVault(owner.address);
      await susd.mint(bob.address, ethers.parseEther("1000"));
      await susd.setVault(await vault.getAddress());

      const bobEthBefore = await ethers.provider.getBalance(bob.address);

      await susd.connect(bob).approve(await vault.getAddress(), ethers.parseEther("1000"));
      await vault.connect(bob).liquidate(alice.address, ethers.ZeroAddress, ethers.parseEther("500"));

      expect(await ethers.provider.getBalance(bob.address)).to.be.gt(bobEthBefore);
      expect(await vault.susdDebt(alice.address)).to.equal(ethers.parseEther("500"));
    });

    it("should revert liquidation when position is healthy", async function () {
      await vault.connect(alice).depositETHAndMint(ethers.parseEther("1000"), { value: ethers.parseEther("1") });
      await expect(
        vault.connect(bob).liquidate(alice.address, ethers.ZeroAddress, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(vault, "AboveLiquidationRatio");
    });
  });

  describe("Admin", function () {
    it("should add a collateral token", async function () {
      const MockPriceFeed2 = await ethers.getContractFactory("MockPriceFeed");
      const feed = await MockPriceFeed2.deploy(50000n * 10n ** 8n);
      const fakeToken = "0x000000000000000000000000000000000000dEaD";
      await vault.addCollateralToken(fakeToken, await feed.getAddress(), 8);

      const ct = await vault.collateralTokens(fakeToken);
      expect(ct.priceFeed).to.equal(await feed.getAddress());
      expect(ct.decimals).to.equal(8);
      expect(ct.enabled).to.be.true;
    });

    it("should revert when adding zero address token", async function () {
      await expect(
        vault.addCollateralToken(ethers.ZeroAddress, ethers.ZeroAddress, 18)
      ).to.be.revertedWithCustomError(vault, "ZeroAddress");
    });
  });
});
