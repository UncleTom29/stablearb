const { ethers } = require("hardhat");

// Sepolia addresses
const CCIP_ROUTER = "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59";
const LINK = "0x779877A7B0D9E8603169DdbD7836e478b4624789";
const ETH_USD_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const VERIFIER_PROXY = "0x09DFf56A4fF44e0f4436260A04F5CFa65636A481";
const ETH_USD_STREAM = "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782";
const SUSD_USD_STREAM = ethers.keccak256(ethers.toUtf8Bytes("SUSD/USD"));
const ARB_SEP_CHAIN_SEL = 3478487238524512106n;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const SUSD = await ethers.getContractFactory("SUSD");
  const susd = await SUSD.deploy();
  await susd.waitForDeployment();
  console.log("SUSD deployed at:", await susd.getAddress());

  const StableArbVault = await ethers.getContractFactory("StableArbVault");
  const vault = await StableArbVault.deploy(await susd.getAddress());
  await vault.waitForDeployment();
  console.log("StableArbVault deployed at:", await vault.getAddress());

  await susd.setVault(await vault.getAddress());
  console.log("Vault authorised in SUSD");

  await vault.addCollateralToken(ethers.ZeroAddress, ETH_USD_FEED, 18);
  console.log("Collateral tokens registered");

  const PegDefender = await ethers.getContractFactory("PegDefender");
  const pegDefender = await PegDefender.deploy(
    await susd.getAddress(),
    deployer.address,
    deployer.address // Using deployer as placeholder for CRE Forwarder
  );
  await pegDefender.waitForDeployment();
  console.log("PegDefender deployed at:", await pegDefender.getAddress());

  const CrossChainBuyback = await ethers.getContractFactory("CrossChainBuyback");
  const buyback = await CrossChainBuyback.deploy(
    CCIP_ROUTER,
    LINK,
    await susd.getAddress()
  );
  await buyback.waitForDeployment();
  console.log("CrossChainBuyback deployed at:", await buyback.getAddress());

  console.log("\n=== Deployment summary ===");
  console.log("SUSD            :", await susd.getAddress());
  console.log("StableArbVault  :", await vault.getAddress());
  console.log("PegDefender     :", await pegDefender.getAddress());
  console.log("CrossChainBuyback:", await buyback.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
