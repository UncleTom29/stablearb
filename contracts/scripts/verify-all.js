const { execSync } = require("child_process");

const SUSD_ADDR = "0x461D7501ae9493b4678C60F97A903fc51069152A";
const VAULT_ADDR = "0x71Fb66498976B7e09fB9FC176Fb1fb53959a4A54";
const DEFENDER_ADDR = "0x216760e96222bCe5DC454a3353364FaD8C088999";
const BUYBACK_ADDR = "0x0a468e2506ff15a74c8D094CC09e48561969Aa12";

const CCIP_ROUTER = "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59";
const LINK = "0x779877A7B0D9E8603169DdbD7836e478b4624789";
const ETH_USD_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const VERIFIER_PROXY = "0x09DFf56A4fF44e0f4436260A04F5CFa65636A481";
const ETH_USD_STREAM = "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782";
const SUSD_USD_STREAM = "0xe90afe8a6887b7f1247df138e60162443e5d26f6518821fa5de585e918a276a8";
const DEPLOYER = "0x9f2EdCE3a34e42eaf8f965d4E14aDDd12Cf865f4";

function verify(name, addr, args = "") {
    console.log(`Verifying ${name} at ${addr}...`);
    try {
        execSync(`npx hardhat verify --network sepolia ${addr} ${args}`, { stdio: "inherit" });
    } catch (e) {
        console.log(`Failed to verify ${name}: ${e.message}`);
    }
}

async function main() {
    verify("SUSD", SUSD_ADDR);
    verify("StableArbVault", VAULT_ADDR, SUSD_ADDR);
    verify("PegDefender", DEFENDER_ADDR, `${VERIFIER_PROXY} ${SUSD_ADDR} ${LINK} ${ETH_USD_FEED} ${DEPLOYER} ${SUSD_USD_STREAM} ${ETH_USD_STREAM}`);
    verify("CrossChainBuyback", BUYBACK_ADDR, `${CCIP_ROUTER} ${LINK} ${SUSD_ADDR}`);
}

main();
