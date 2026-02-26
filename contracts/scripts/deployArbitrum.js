const { ethers } = require("hardhat");

// Arbitrum Sepolia addresses
const CCIP_ROUTER_ARB = "0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165";
const LINK_ARB        = "0xb1D4538B4571d411F07960EF2838Ce337FE1E80E";
const SEPOLIA_CHAIN_SEL = 16015286601757825753n;

async function main() {
  const [deployer] = await ethers.getSigners();
  const sepoliaBuyback = process.env.SEPOLIA_BUYBACK_ADDRESS;
  if (!sepoliaBuyback) throw new Error("SEPOLIA_BUYBACK_ADDRESS env var required");

  console.log("Deploying with account:", deployer.address);

  const SUSD = await ethers.getContractFactory("SUSD");
  const susdArb = await SUSD.deploy();
  await susdArb.waitForDeployment();
  console.log("SUSD (Arb Sepolia) deployed at:", await susdArb.getAddress());

  const CrossChainBuyback = await ethers.getContractFactory("CrossChainBuyback");
  const receiver = await CrossChainBuyback.deploy(
    CCIP_ROUTER_ARB,
    LINK_ARB,
    await susdArb.getAddress()
  );
  await receiver.waitForDeployment();
  console.log("CrossChainBuyback (Arb receiver) deployed at:", await receiver.getAddress());

  await receiver.setAllowedSource(SEPOLIA_CHAIN_SEL, sepoliaBuyback);
  console.log("Allowed source set: Sepolia", sepoliaBuyback);

  await susdArb.setVault(await receiver.getAddress());
  console.log("Receiver authorised as vault in SUSD (Arb)");

  console.log("\n=== Arbitrum Sepolia deployment summary ===");
  console.log("SUSD (Arb)        :", await susdArb.getAddress());
  console.log("CrossChainBuyback :", await receiver.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
