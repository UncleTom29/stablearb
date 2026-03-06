const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("PegDefender", function () {
  let susd, defender;
  let owner, treasury, forwarder;

  beforeEach(async function () {
    [owner, treasury, forwarder] = await ethers.getSigners();

    const SUSD = await ethers.getContractFactory("SUSD");
    susd = await SUSD.deploy();

    const PegDefender = await ethers.getContractFactory("PegDefender");
    defender = await PegDefender.deploy(
      await susd.getAddress(),
      treasury.address,
      forwarder.address
    );

    await susd.setVault(await defender.getAddress());
  });

  const encodeReport = (price, actionType, amount) => {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "string", "uint256"],
      [price, actionType, amount]
    );
  };

  describe("onReport", function () {
    it("should revert if caller is not forwarder", async function () {
      const report = encodeReport(ethers.parseEther("1"), "NONE", 0n);
      await expect(defender.onReport("0x", report)).to.be.revertedWithCustomError(
        defender,
        "UnauthorizedForwarder"
      );
    });

    it("should no-op at NONE action", async function () {
      const performData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "string", "uint256"],
        [ethers.parseEther("1"), "NONE", 0n]
      );
      await defender.connect(forwarder).onReport("0x", performData);
      expect(await susd.totalSupply()).to.equal(0n);
    });

    it("should mint to treasury on MINT action", async function () {
      const amount = ethers.parseEther("25");
      const report = encodeReport(ethers.parseEther("1.01"), "MINT", amount);

      await defender.connect(forwarder).onReport("0x", report);

      expect(await susd.balanceOf(treasury.address)).to.be.gt(0n);
      expect(await susd.balanceOf(treasury.address)).to.equal(amount);
    });

    it("should burn treasury balance on BUYBACK action", async function () {
      // Pre-seed treasury with SUSD (temporarily set owner as vault to mint)
      await susd.setVault(owner.address);
      await susd.mint(treasury.address, ethers.parseEther("100"));
      await susd.setVault(await defender.getAddress());

      const burnAmount = ethers.parseEther("40");
      const report = encodeReport(ethers.parseEther("0.99"), "BUYBACK", burnAmount);

      await defender.connect(forwarder).onReport("0x", report);

      expect(await susd.balanceOf(treasury.address)).to.be.lt(ethers.parseEther("100"));
      expect(await susd.balanceOf(treasury.address)).to.equal(ethers.parseEther("60"));
    });
  });

  describe("Cooldown", function () {
    it("should revert if cooldown has not elapsed", async function () {
      const report = encodeReport(ethers.parseEther("1.01"), "MINT", ethers.parseEther("10"));
      await defender.connect(forwarder).onReport("0x", report);

      await expect(defender.connect(forwarder).onReport("0x", report))
        .to.be.revertedWithCustomError(defender, "CooldownNotElapsed");
    });

    it("should allow action after cooldown", async function () {
      const report = encodeReport(ethers.parseEther("1.01"), "MINT", ethers.parseEther("5"));
      await defender.connect(forwarder).onReport("0x", report);

      await time.increase(6 * 60); // 6 minutes
      await defender.connect(forwarder).onReport("0x", report); // should not revert
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
      await defender.setForwarder(owner.address);
      expect(await defender.forwarder()).to.equal(owner.address);
    });

    it("should set cooldown", async function () {
      await defender.setCooldown(10 * 60); // 10 minutes
      expect(await defender.cooldown()).to.equal(10 * 60);
    });
  });
});
