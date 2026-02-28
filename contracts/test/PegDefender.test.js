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

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * ABI-encode a BasicReport struct to be returned by MockVerifier.verify().
   * Matches the on-chain BasicReport layout used in PegDefender._verifyAndExtractPrice.
   */
  function encodeBasicReport({
    feedId = SUSD_FEED,
    validFromTimestamp = 0,
    observationsTimestamp = 0,
    nativeFee = 0n,
    linkFee = 0n,
    expiresAt = Math.floor(Date.now() / 1000) + 3600,
    price,
    bid,
    ask,
  }) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "bytes32", // feedId
        "uint32",  // validFromTimestamp
        "uint32",  // observationsTimestamp
        "uint192", // nativeFee
        "uint192", // linkFee
        "uint32",  // expiresAt
        "int192",  // price
        "int192",  // bid
        "int192",  // ask
      ],
      [
        feedId,
        validFromTimestamp,
        observationsTimestamp,
        nativeFee,
        linkFee,
        expiresAt,
        price,
        bid ?? price,
        ask ?? price,
      ]
    );
  }

  /**
   * Build performData for the Data Streams path:
   * ABI-encode as (bytes[] values, bytes extraData) which matches
   * the output of PegDefender.checkCallback.
   */
  function buildDataStreamsPerformData(reportBytes) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes[]", "bytes"],
      [[reportBytes], "0x"]
    );
  }

  // ── Data Streams path ─────────────────────────────────────────────────────

  describe("Data Streams path", function () {
    it("should mint via Data Streams when price is above peg", async function () {
      const abovePegPrice = ethers.parseEther("1.01"); // $1.01 (18 dec)
      const reportBytes = encodeBasicReport({ price: abovePegPrice });
      await verifier.setReturnData(reportBytes);

      const performData = buildDataStreamsPerformData(ethers.randomBytes(32));
      await defender.performUpkeep(performData);

      expect(await susd.balanceOf(treasury.address)).to.be.gt(0n);
    });

    it("should burn (buyback) via Data Streams when price is below peg", async function () {
      await susd.setVault(owner.address);
      await susd.mint(treasury.address, ethers.parseEther("100"));
      await susd.setVault(await defender.getAddress());

      const belowPegPrice = ethers.parseEther("0.99"); // $0.99 (18 dec)
      const reportBytes = encodeBasicReport({ price: belowPegPrice });
      await verifier.setReturnData(reportBytes);

      const performData = buildDataStreamsPerformData(ethers.randomBytes(32));
      await defender.performUpkeep(performData);

      expect(await susd.balanceOf(treasury.address)).to.be.lt(ethers.parseEther("100"));
    });

    it("should emit PegDefenseTriggered on Data Streams buyback", async function () {
      await susd.setVault(owner.address);
      await susd.mint(treasury.address, ethers.parseEther("200"));
      await susd.setVault(await defender.getAddress());

      const belowPegPrice = ethers.parseEther("0.99");
      await verifier.setReturnData(encodeBasicReport({ price: belowPegPrice }));
      const performData = buildDataStreamsPerformData(ethers.randomBytes(32));

      await expect(defender.performUpkeep(performData))
        .to.emit(defender, "PegDefenseTriggered");
    });

    it("should take no action when Data Streams price is at peg", async function () {
      const atPegPrice = ethers.parseEther("1.0"); // exactly $1.00
      await verifier.setReturnData(encodeBasicReport({ price: atPegPrice }));
      const performData = buildDataStreamsPerformData(ethers.randomBytes(32));

      await defender.performUpkeep(performData);

      expect(await susd.totalSupply()).to.equal(0n);
    });

    it("should emit FallbackUsed when checkErrorHandler is called", async function () {
      // Simulate Data Streams error: fallback feed returns above-peg price
      await fallbackFeed.setPrice(ethers.parseUnits("1.01", 8));

      // checkErrorHandler should use push oracle fallback
      const [upkeepNeeded, performData] = await defender.checkErrorHandler(0, "0x");
      expect(upkeepNeeded).to.be.true;

      // performUpkeep with the fallback-encoded data should emit FallbackUsed
      await expect(defender.performUpkeep(performData))
        .to.emit(defender, "FallbackUsed");
    });

    it("checkCallback should return upkeepNeeded=true and encoded performData", async function () {
      const fakeReport = ethers.randomBytes(64);
      const [upkeepNeeded, performData] = await defender.checkCallback([fakeReport], "0x");

      expect(upkeepNeeded).to.be.true;
      // performData should be ABI-decodable as (bytes[], bytes)
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["bytes[]", "bytes"],
        performData
      );
      expect(decoded[0]).to.have.lengthOf(1);
    });

    it("checkCallback with empty values returns upkeepNeeded=false", async function () {
      const [upkeepNeeded] = await defender.checkCallback([], "0x");
      expect(upkeepNeeded).to.be.false;
    });
  });
});

