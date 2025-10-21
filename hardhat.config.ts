import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-gas-reporter";
import "solidity-coverage";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Import tasks
import "./tasks";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },

  networks: {
    hardhat: {
      chainId: 31337,
    },
    amoy: {
      url: process.env.RPC_URL_AMOY || "https://rpc-amoy.polygon.technology/",
      chainId: 80002,
      accounts: process.env.ADMIN_PRIVATE_KEY
        ? [process.env.ADMIN_PRIVATE_KEY, process.env.OPERATOR_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY]
        : [],
      gasPrice: 50000000000, // 50 gwei
    },
    polygon: {
      url: process.env.RPC_URL_POLYGON || "https://polygon-rpc.com/",
      chainId: 137,
      accounts: process.env.ADMIN_PRIVATE_KEY
        ? [process.env.ADMIN_PRIVATE_KEY, process.env.OPERATOR_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY]
        : [],
      gasPrice: 200000000000, // 200 gwei - adjust based on network conditions
    },
  },

  etherscan: {
    apiKey: process.env.POLYGONSCAN_API_KEY || "",
    customChains: [
      {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com"
        }
      }
    ]
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    outputFile: "gas-report.txt",
    noColors: true,
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  mocha: {
    timeout: 40000,
  },
};

export default config;
