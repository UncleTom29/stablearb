const { ethers } = require("hardhat");

// Arbitrum Sepolia addresses (Normalized)
const CCIP_ROUTER = ethers.getAddress("0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165".toLowerCase());
const LINK = ethers.getAddress("0xb1D4538B4571d411F07960EF2838Ce337FE1E80E".toLowerCase());
const ETH_USD_FEED = ethers.getAddress("0xd30621d866d2581693D22139752F1d295e23C914".toLowerCase());
const VERIFIER_PROXY = ethers.getAddress("0x2ff010DEbC1297f19579B4246cad07bd24F2488A".toLowerCase());
const ETH_USD_STREAM = "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782";
const SUSD_USD_STREAM = "0xe90afe8a6887b7f1247df138e60162443e5d26f6518821fa5de585e918a276a8";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying to Arbitrum Sepolia with account:", deployer.address);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

    // 1. Deploy SUSD
    const SUSD = await ethers.getContractFactory("SUSD");
    const susd = await SUSD.deploy();
    await susd.waitForDeployment();
    const susdAddr = await susd.getAddress();
    console.log("SUSD deployed at:", susdAddr);

    // 2. Deploy Vault
    const StableArbVault = await ethers.getContractFactory("StableArbVault");
    const vault = await StableArbVault.deploy(susdAddr);
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();
    console.log("StableArbVault deployed at:", vaultAddr);

    // 3. Setup SUSD
    await (await susd.setVault(vaultAddr)).wait();
    console.log("Vault authorized in SUSD");

    // 4. Setup Vault Collateral (ETH)
    await (await vault.addCollateralToken(ethers.ZeroAddress, ETH_USD_FEED, 18)).wait();
    console.log("Collateral tokens (ETH) registered in Vault");

    // 5. Deploy PegDefender
    const PegDefender = await ethers.getContractFactory("PegDefender");
    const pegDefender = await PegDefender.deploy(
        VERIFIER_PROXY,
        susdAddr,
        LINK,
        ETH_USD_FEED,
        deployer.address,
        SUSD_USD_STREAM,
        ETH_USD_STREAM
    );
    await pegDefender.waitForDeployment();
    const defenderAddr = await pegDefender.getAddress();
    console.log("PegDefender deployed at:", defenderAddr);

    // 6. Deploy CrossChainBuyback
    const CrossChainBuyback = await ethers.getContractFactory("CrossChainBuyback");
    const buyback = await CrossChainBuyback.deploy(
        CCIP_ROUTER,
        LINK,
        susdAddr
    );
    await buyback.waitForDeployment();
    const buybackAddr = await buyback.getAddress();
    console.log("CrossChainBuyback deployed at:", buybackAddr);

    console.log("\n=== Arbitrum Sepolia Deployment Summary ===");
    console.log(`npx hardhat verify --network arbitrum-sepolia ${susdAddr}`);
    console.log(`npx hardhat verify --network arbitrum-sepolia ${vaultAddr} ${susdAddr}`);
    console.log(`npx hardhat verify --network arbitrum-sepolia ${defenderAddr} ${VERIFIER_PROXY} ${susdAddr} ${LINK} ${ETH_USD_FEED} ${deployer.address} ${SUSD_USD_STREAM} ${ETH_USD_STREAM}`);
    console.log(`npx hardhat verify --network arbitrum-sepolia ${buybackAddr} ${CCIP_ROUTER} ${LINK} ${susdAddr}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
