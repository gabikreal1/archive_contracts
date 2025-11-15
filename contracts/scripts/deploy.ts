import { config as dotenvConfig } from "dotenv";
import type { Provider } from "ethers";
import { ethers } from "hardhat";
import path from "path";
import { promises as fs } from "fs";

dotenvConfig();

async function main() {
  const [deployer] = await ethers.getSigners();
  const usdcAddress = process.env.USDC_TOKEN_ADDRESS;

  if (!usdcAddress) {
    throw new Error("USDC_TOKEN_ADDRESS missing in env");
  }

  const network = await deployer.provider.getNetwork();
  console.log(`Deploying to chain ${network.chainId} with ${deployer.address}`);

  const jobRegistry = await ethers.deployContract("JobRegistry", [deployer.address]);
  await jobRegistry.waitForDeployment();
  console.log(`JobRegistry: ${jobRegistry.target}`);

  const reputation = await ethers.deployContract("ReputationToken", [deployer.address]);
  await reputation.waitForDeployment();
  console.log(`ReputationToken: ${reputation.target}`);

  const escrow = await ethers.deployContract("Escrow", [deployer.address, usdcAddress, deployer.address]);
  await escrow.waitForDeployment();
  console.log(`Escrow: ${escrow.target}`);

  const orderBook = await ethers.deployContract("OrderBook", [deployer.address, jobRegistry.target]);
  await orderBook.waitForDeployment();
  console.log(`OrderBook: ${orderBook.target}`);

  const agentRegistry = await ethers.deployContract("AgentRegistry", [deployer.address]);
  await agentRegistry.waitForDeployment();
  console.log(`AgentRegistry: ${agentRegistry.target}`);

  const txOverrides = await buildTxOverrides(deployer.provider);

  // Send sequentially to avoid nonce collisions on Arc mempool
  await jobRegistry.setOrderBook(orderBook.target, txOverrides);
  await escrow.setOrderBook(orderBook.target, txOverrides);
  await escrow.setReputation(reputation.target, txOverrides);
  await reputation.setEscrow(escrow.target, txOverrides);
  await reputation.setAgentRegistry(agentRegistry.target, txOverrides);
  await agentRegistry.setReputationOracle(reputation.target, txOverrides);
  await orderBook.setEscrow(escrow.target, txOverrides);
  await orderBook.setReputationToken(reputation.target, txOverrides);
  await orderBook.setAgentRegistry(agentRegistry.target, txOverrides);

  const deploymentRecord = {
    network: network.name,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    usdc: usdcAddress,
    contracts: {
      JobRegistry: jobRegistry.target,
      ReputationToken: reputation.target,
      Escrow: escrow.target,
      OrderBook: orderBook.target,
      AgentRegistry: agentRegistry.target
    }
  } as const;

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  await fs.mkdir(deploymentsDir, { recursive: true });
  const filePath = path.join(deploymentsDir, `arc-${deploymentRecord.chainId}.json`);
  await fs.writeFile(filePath, JSON.stringify(deploymentRecord, null, 2));

  console.log("Contracts wired together. Deployment saved to:", filePath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function buildTxOverrides(provider?: Provider | null) {
  if (process.env.ARC_TX_GWEI) {
    const fee = ethers.parseUnits(process.env.ARC_TX_GWEI, "gwei");
    return {
      maxFeePerGas: fee,
      maxPriorityFeePerGas: fee / 2n
    } as const;
  }

  if (!provider) return undefined;

  const feeData = await provider.getFeeData();
  if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
    return undefined;
  }

  const priority = (feeData.maxPriorityFeePerGas * 3n) / 2n; // +50%
  const maxFee = (feeData.maxFeePerGas * 3n) / 2n; // +50%

  return {
    maxFeePerGas: maxFee,
    maxPriorityFeePerGas: priority
  } as const;
}
