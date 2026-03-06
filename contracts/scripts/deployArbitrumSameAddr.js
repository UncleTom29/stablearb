const { ethers } = require("hardhat");

// Arbitrum Sepolia addresses (Normalized)
const CCIP_ROUTER = ethers.getAddress("0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165");
const LINK = ethers.getAddress("0xb1D4538B4571d411F07960EF2838Ce337FE1E80E");
const ETH_USD_FEED = ethers.getAddress("0xd30621d866d2581693d22139752f1d295e23c914");
const VERIFIER_PROXY = ethers.getAddress("0x2ff010DEbC1297f19579B4246cad07bd24F2488A");
const ETH_USD_STREAM = "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782";
const SUSD_USD_STREAM = "0xe90afe8a6887b7f1247df138e60162443e5d26f6518821fa5de585e918a276a8";

async function main() {
    const [deployer] = await ethers.getSigners();
    const currentNonce = await deployer.getNonce();

    console.log("Deployer:", deployer.address);
    console.log("Current nonce:", currentNonce);

    if (currentNonce !== 0) {
        console.error(`\n❌ ERROR: Current nonce is ${currentNonce}.`);
        console.error(`To match Sepolia addresses, you MUST use a fresh account with Nonce 0.`);
        console.error(`Please use a new private key or a fresh wallet for this deployment.`);
        process.exit(1);
    }

    console.log("Current balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
    console.log("\nStarting deterministic deployment (Sequence: 0->6)...");

    // Nonce 0: Dummy transaction (Sepolia had a tx before deployment)
    console.log("[Nonce 0] Incrementing nonce...");
    await (await deployer.sendTransaction({ to: deployer.address, value: 0 })).wait();

    // Nonce 1: SUSD
    const SUSD = await ethers.getContractFactory("SUSD");
    const susd = await SUSD.deploy();
    await susd.waitForDeployment();
    console.log("[Nonce 1] SUSD deployed at:", await susd.getAddress()); // Expected: 0x461D7501ae9493b4678C60F97A903fc51069152A

    // Nonce 2: StableArbVault
    const StableArbVault = await ethers.getContractFactory("StableArbVault");
    const vault = await StableArbVault.deploy(await susd.getAddress());
    await vault.waitForDeployment();
    console.log("[Nonce 2] StableArbVault deployed at:", await vault.getAddress()); // Expected: 0x71Fb66498976B7e09fB9FC176Fb1fb53959a4A54

    // Nonce 3: Dummy transaction (matches susd.setVault)
    console.log("[Nonce 3] Incrementing nonce...");
    await (await deployer.sendTransaction({ to: deployer.address, value: 0 })).wait();

    // Nonce 4: Dummy transaction (matches vault.addCollateralToken)
    console.log("[Nonce 4] Incrementing nonce...");
    await (await deployer.sendTransaction({ to: deployer.address, value: 0 })).wait();

    // Nonce 5: PegDefender
    const PegDefender = await ethers.getContractFactory("PegDefender");
    const pegDefender = await PegDefender.deploy(
        await susd.getAddress(),
        deployer.address,
        deployer.address // Using deployer as placeholder for CRE Forwarder
    );
    await pegDefender.waitForDeployment();
    console.log("[Nonce 5] PegDefender deployed at:", await pegDefender.getAddress()); // Expected: 0x216760e96222bCe5DC454a3353364FaD8C088999

    // Nonce 6: CrossChainBuyback
    const CrossChainBuyback = await ethers.getContractFactory("CrossChainBuyback");
    const buyback = await CrossChainBuyback.deploy(
        CCIP_ROUTER,
        LINK,
        await susd.getAddress()
    );
    await buyback.waitForDeployment();
    console.log("[Nonce 6] CrossChainBuyback deployed at:", await buyback.getAddress()); // Expected: 0x0a468e2506ff15a74c8D094CC09e48561969Aa12

    console.log("\n=== Arbitrum Sepolia Same-Address Deployment Summary ===");
    console.log("SUSD            :", await susd.getAddress());
    console.log("StableArbVault  :", await vault.getAddress());
    console.log("PegDefender     :", await pegDefender.getAddress());
    console.log("CrossChainBuyback:", await buyback.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

