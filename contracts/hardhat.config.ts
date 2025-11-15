import { config as dotenvConfig } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

dotenvConfig();

const accounts = process.env.ARC_PRIVATE_KEY ? [process.env.ARC_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 31337
    },
    arc: {
      url: process.env.ARC_RPC_URL || "",
      chainId: Number(process.env.ARC_CHAIN_ID || 421613),
      accounts
    }
  }
};

export default config;
