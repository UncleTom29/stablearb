const { ethers } = require("hardhat");

const LINK             = "0x779877A7B0D9E8603169DdbD7836e478b4624789";
const AUTOMATION_REGISTRAR = "0xb0E49c5D0d05cbc241d68c05BC5BA1d1B7B72976";
const INITIAL_LINK_FUNDING = ethers.parseEther("5");

const REGISTRAR_ABI = [
  {
    "inputs": [
      {
        "components": [
          { "name": "name", "type": "string" },
          { "name": "encryptedEmail", "type": "bytes" },
          { "name": "upkeepContract", "type": "address" },
          { "name": "gasLimit", "type": "uint32" },
          { "name": "adminAddress", "type": "address" },
          { "name": "triggerType", "type": "uint8" },
          { "name": "checkData", "type": "bytes" },
          { "name": "triggerConfig", "type": "bytes" },
          { "name": "offchainConfig", "type": "bytes" },
          { "name": "amount", "type": "uint96" }
        ],
        "name": "params",
        "type": "tuple"
      }
    ],
    "name": "registerUpkeep",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const pegDefender = process.env.PEG_DEFENDER_ADDRESS;
  if (!pegDefender) throw new Error("PEG_DEFENDER_ADDRESS env var required");

  const link = await ethers.getContractAt("IERC20", LINK);
  await link.approve(AUTOMATION_REGISTRAR, INITIAL_LINK_FUNDING);

  const registrar = new ethers.Contract(AUTOMATION_REGISTRAR, REGISTRAR_ABI, deployer);
  const upkeepId = await registrar.registerUpkeep({
    name:            "StableArb PegDefender",
    encryptedEmail:  "0x",
    upkeepContract:  pegDefender,
    gasLimit:        500_000,
    adminAddress:    deployer.address,
    triggerType:     0,
    checkData:       "0x",
    triggerConfig:   "0x",
    offchainConfig:  "0x",
    amount:          INITIAL_LINK_FUNDING,
  });
  console.log("Upkeep registered with ID:", upkeepId.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
