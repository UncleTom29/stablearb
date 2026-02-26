const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("PegDefender", function () {
  let susd, defender, verifier, link, fallbackFeed;
  let owner, treasury;

  const SUSD_FEED = ethers.keccak256(ethers.toUtf8Bytes("SUSD/USD"));
  const ETH_FEED = "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782";

  beforeEach(async function () {
    [owner, treasury] = await ethers.getSigners();

    const SUSD = await ethers.getContractFactory("SUSD");
    susd = await SUSD.deploy();

    const MockVerifier = await ethers.getContractFactory("MockVerifier");
    verifier = await MockVerifier.deploy();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    link = await MockERC20.deploy();

    const MockFallbackFeed = await ethers.getContractFactory("MockFallbackFeed");
    fallbackFeed = await MockFallbackFeed.deploy(1n * 10n ** 8n); // $1.00

    const PegDefender = await ethers.getContractFactory("PegDefender");
    defender = await PegDefender.deploy(
      await verifier.getAddress(),
      await susd.getAddress(),
      await link.getAddress(),
      await fallbackFeed.getAddress(),
      treasury.address,
      SUSD_FEED,
      ETH_FEED
    );

    await susd.setVault(await defender.getAddress());
  });

  describe("Fallback path", function () {
    it("should not act when at peg", async function () {
      await defender.toggleDataStreams(false);
      const performData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bool"],
        [ethers.parseEther("1"), false]
      );
      await defender.performUpkeep(performData);
      expect(await susd.totalSupply()).to.equal(0n);
    });

    it("should mint when above peg", async function () {
      await defender.toggleDataStreams(false);
      const abovePegPrice = ethers.parseEther("1.01");
      const performData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bool"],
        [abovePegPrice, false]
      );
      await defender.performUpkeep(performData);
      expect(await susd.balanceOf(treasury.address)).to.be.gt(0n);
    });

    it("should burn (buyback) when below peg", async function () {
      // Pre-seed treasury with SUSD (temporarily set owner as vault to mint)
      await susd.setVault(owner.address);
      await susd.mint(treasury.address, ethers.parseEther("100"));
      await susd.setVault(await defender.getAddress());

      await defender.toggleDataStreams(false);
      const belowPegPrice = ethers.parseEther("0.990");
      const performData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bool"],
        [belowPegPrice, false]
      );
      await defender.performUpkeep(performData);
      expect(await susd.balanceOf(treasury.address)).to.be.lt(ethers.parseEther("100"));
    });
  });

  describe("Cooldown", function () {
    it("should revert if cooldown has not elapsed", async function () {
      await defender.toggleDataStreams(false);
      const belowPegPrice = ethers.parseEther("0.990");

      // Pre-seed treasury with SUSD
      await susd.setVault(owner.address);
      await susd.mint(treasury.address, ethers.parseEther("100"));
      await susd.setVault(await defender.getAddress());

      const performData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bool"],
        [belowPegPrice, false]
      );
      await defender.performUpkeep(performData);

      await expect(defender.performUpkeep(performData))
        .to.be.revertedWithCustomError(defender, "CooldownNotElapsed");
    });

    it("should allow action after cooldown", async function () {
      await defender.toggleDataStreams(false);
      const belowPegPrice = ethers.parseEther("0.990");

      // Pre-seed treasury with SUSD
      await susd.setVault(owner.address);
      await susd.mint(treasury.address, ethers.parseEther("200"));
      await susd.setVault(await defender.getAddress());

      const performData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bool"],
        [belowPegPrice, false]
      );
      await defender.performUpkeep(performData);

      await time.increase(6 * 60); // 6 minutes
      await defender.performUpkeep(performData); // should not revert
    });
  });

  describe("Admin", function () {
    it("should set treasury", async function () {
      const newTreasury = "0x0000000000000000000000000000000000001234";
      await defender.setTreasury(newTreasury);
      expect(await defender.treasury()).to.equal(newTreasury);
    });

    it("should revert when setting treasury to zero address", async function () {
      await expect(defender.setTreasury(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(defender, "ZeroAddress");
    });

    it("should set max action amount", async function () {
      await defender.setMaxActionAmount(ethers.parseEther("500"));
      expect(await defender.maxActionAmount()).to.equal(ethers.parseEther("500"));
    });

    it("should set cooldown", async function () {
      await defender.setCooldown(10 * 60); // 10 minutes
      expect(await defender.cooldown()).to.equal(10 * 60);
    });
  });
});
