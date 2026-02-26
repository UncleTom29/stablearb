require("@nomicfoundation/hardhat-toolbox");
const path = require("path");
const { glob } = require("hardhat/internal/util/glob");
const { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } = require("hardhat/builtin-tasks/task-names");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS, async (_, { config }, runSuper) => {
  const srcPaths = await glob(path.join(config.paths.root, "src/**/*.sol"));
  const mockPaths = await glob(path.join(config.paths.root, "test/mocks/**/*.sol"));
  return [...srcPaths, ...mockPaths];
});

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args) => {
  if (args.solcVersion === "0.8.20") {
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: "0.8.20",
      longVersion: "0.8.20+commit.a1b79de6.Emscripten.clang",
    };
  }
  // Fallback to default behaviour for other versions
  return undefined;
});

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    "arbitrum-sepolia": {
      url: process.env.ARB_SEPOLIA_RPC || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      arbitrumSepolia: process.env.ARBISCAN_API_KEY || "",
    },
  },
};
