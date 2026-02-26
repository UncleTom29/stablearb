const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CrossChainBuyback", function () {
  let susd, buyback, router, link;
  let owner, recipient;

  const DEST_CHAIN = 3478487238524512106n;
  const SOURCE_CHAIN = 16015286601757825753n;

  beforeEach(async function () {
    [owner, recipient] = await ethers.getSigners();

    const SUSD = await ethers.getContractFactory("SUSD");
    susd = await SUSD.deploy();

    const MockCCIPRouter = await ethers.getContractFactory("MockCCIPRouter");
    router = await MockCCIPRouter.deploy();

    const MockLink = await ethers.getContractFactory("MockLink");
    link = await MockLink.deploy();

    const CrossChainBuyback = await ethers.getContractFactory("CrossChainBuyback");
    buyback = await CrossChainBuyback.deploy(
      await router.getAddress(),
      await link.getAddress(),
      await susd.getAddress()
    );

    await buyback.setDestination(DEST_CHAIN, await buyback.getAddress());
    await buyback.setAllowedSource(SOURCE_CHAIN, await buyback.getAddress());
    await susd.setVault(await buyback.getAddress());
  });

  describe("sendAction", function () {
    it("should send BUYBACK action paying in native ETH", async function () {
      const msgId = await buyback.sendAction.staticCall(
        0, // BUYBACK
        ethers.parseEther("1000"),
        ethers.ZeroAddress,
        false,
        { value: ethers.parseEther("0.01") }
      );
      await buyback.sendAction(
        0, // BUYBACK
        ethers.parseEther("1000"),
        ethers.ZeroAddress,
        false,
        { value: ethers.parseEther("0.01") }
      );
      expect(msgId).to.equal(await router.lastMessageId());
    });

    it("should send MINT action paying in LINK", async function () {
      await link.mint(owner.address, ethers.parseEther("5"));
      await link.approve(await buyback.getAddress(), ethers.parseEther("5"));

      const msgId = await buyback.sendAction.staticCall(
        1, // MINT
        ethers.parseEther("500"),
        recipient.address,
        true
      );
      await buyback.sendAction(
        1, // MINT
        ethers.parseEther("500"),
        recipient.address,
        true
      );
      expect(msgId).to.equal(await router.lastMessageId());
    });

    it("should revert if insufficient native fee", async function () {
      await expect(
        buyback.sendAction(0, ethers.parseEther("100"), ethers.ZeroAddress, false, { value: 0 })
      ).to.be.revertedWithCustomError(buyback, "InsufficientFee");
    });
  });

  describe("ccipReceive", function () {
    function buildMessage(actionType, amount, recipientAddr) {
      const action = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(uint8 actionType, uint256 amount, address recipient)"],
        [[actionType, amount, recipientAddr]]
      );
      return {
        messageId: ethers.keccak256(ethers.toUtf8Bytes("test")),
        sourceChainSelector: SOURCE_CHAIN,
        sender: ethers.AbiCoder.defaultAbiCoder().encode(["address"], [buyback.target]),
        data: action,
        destTokenAmounts: [],
      };
    }

    it("should mint SUSD on MINT action", async function () {
      const message = buildMessage(1, ethers.parseEther("200"), recipient.address);
      await router.simulateCcipReceive(await buyback.getAddress(), message);
      expect(await susd.balanceOf(recipient.address)).to.equal(ethers.parseEther("200"));
    });

    it("should burn SUSD on BUYBACK action", async function () {
      // Pre-seed buyback with SUSD via a MINT ccip action (buyback is the vault)
      const mintMessage = buildMessage(1, ethers.parseEther("300"), await buyback.getAddress());
      await router.simulateCcipReceive(await buyback.getAddress(), mintMessage);

      const message = buildMessage(0, ethers.parseEther("300"), ethers.ZeroAddress);
      await router.simulateCcipReceive(await buyback.getAddress(), message);
      expect(await susd.balanceOf(await buyback.getAddress())).to.equal(0n);
    });

    it("should revert if called directly (not from router)", async function () {
      const message = buildMessage(1, ethers.parseEther("100"), recipient.address);
      await expect(
        buyback.connect(recipient).ccipReceive(message)
      ).to.be.reverted;
    });

    it("should revert if from unauthorised source chain", async function () {
      const message = buildMessage(1, ethers.parseEther("100"), recipient.address);
      message.sourceChainSelector = 999n;
      await expect(
        router.simulateCcipReceive(await buyback.getAddress(), message)
      ).to.be.reverted;
    });
  });

  describe("Admin", function () {
    it("should set allowed source", async function () {
      await buyback.setAllowedSource(12345n, "0x0000000000000000000000000000000000001234");
      expect(await buyback.allowedSources(12345n)).to.equal("0x0000000000000000000000000000000000001234");
    });

    it("should set destination", async function () {
      await buyback.setDestination(DEST_CHAIN, "0x0000000000000000000000000000000000009999");
      expect(await buyback.destReceiver()).to.equal("0x0000000000000000000000000000000000009999");
    });
  });
});
