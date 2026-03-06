const { execSync } = require("child_process");

const SUSD_ADDR = "0x7B2151392F8428Cf6EA48B6603c1BD6605B02Dbd";
const VAULT_ADDR = "0x216760e96222bCe5DC454a3353364FaD8C088999";
const DEFENDER_ADDR = "0x0B680f3E100ce638c77b0fA2761c695E5f87Cc9E";
const BUYBACK_ADDR = "0xC9C0F7d64f3863434FacE04Ab844694126a03252";

const CCIP_ROUTER = "0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165";
const LINK = "0xb1D4538B4571d411F07960EF2838Ce337FE1E80E";
const ETH_USD_FEED = "0xd30621D866d2581693D22139752F1d295e23C914";
const VERIFIER_PROXY = "0x2ff010DEbC1297f19579B4246cad07bd24F2488A";
const ETH_USD_STREAM = "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782";
const SUSD_USD_STREAM = "0xe90afe8a6887b7f1247df138e60162443e5d26f6518821fa5de585e918a276a8";
const DEPLOYER = "0x9f2EdCE3a34e42eaf8f965d4E14aDDd12Cf865f4";

function verify(name, addr, args = "") {
    console.log(`Verifying ${name} at ${addr}...`);
    try {
        execSync(`npx hardhat verify --network arbitrumSepolia ${addr} ${args}`, { stdio: "inherit" });
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
