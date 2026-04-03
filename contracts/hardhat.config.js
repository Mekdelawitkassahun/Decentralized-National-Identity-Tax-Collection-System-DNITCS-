require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    // Connect to the already-running `npx hardhat node` on port 8545.
    // This ensures redeploys happen on the same chain state (so "start over" actually clears registered citizens).
    localhost: {
      url: "http://127.0.0.1:8545",
      accounts: {
        // Match Hardhat's default `hardhat node` mnemonic (seen in the node startup log).
        mnemonic: "test test test test test test test test test test test junk",
      },
      timeout: 600000,
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : {
        mnemonic: process.env.MNEMONIC || "",
      },
      timeout: 600000,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  // For deterministic deployment
  deterministicDeployment: true,
};
