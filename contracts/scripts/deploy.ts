import { config as dotenvConfig } from "dotenv";
import type { Provider } from "ethers";
import { ethers } from "hardhat";
import path from "path";
import { promises as fs } from "fs";

dotenvConfig();

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  baseDelay = 2000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isTooManyRequests = 
        error?.message?.includes("Too Many Requests") ||
        error?.code === "ECONNRESET" ||
        error?.code === "ETIMEDOUT";
      
      if (!isTooManyRequests || i === maxRetries - 1) {
        throw error;
      }
      
      const delayMs = baseDelay * Math.pow(2, i);
      console.log(`Rate limited, retrying in ${delayMs}ms... (attempt ${i + 1}/${maxRetries})`);
      await delay(delayMs);
    }
  }
  throw new Error("Max retries exceeded");
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const usdcAddress = process.env.USDC_TOKEN_ADDRESS;

  if (!usdcAddress) {
    throw new Error("USDC_TOKEN_ADDRESS missing in env");
  }

  const network = await deployer.provider.getNetwork();
  console.log(`Deploying to chain ${network.chainId} with ${deployer.address}`);

  console.log("Deploying JobRegistry...");
  const jobRegistry = await retryWithBackoff(() => 
    ethers.deployContract("JobRegistry", [deployer.address])
  );
  await retryWithBackoff(() => jobRegistry.waitForDeployment());
  console.log(`JobRegistry: ${jobRegistry.target}`);
  await delay(3000);

  console.log("Deploying ReputationToken...");
  const reputation = await retryWithBackoff(() =>
    ethers.deployContract("ReputationToken", [deployer.address])
  );
  await retryWithBackoff(() => reputation.waitForDeployment());
  console.log(`ReputationToken: ${reputation.target}`);
  await delay(3000);

  console.log("Deploying Escrow...");
  const escrow = await retryWithBackoff(() =>
    ethers.deployContract("Escrow", [deployer.address, usdcAddress, deployer.address])
  );
  await retryWithBackoff(() => escrow.waitForDeployment());
  console.log(`Escrow: ${escrow.target}`);
  await delay(3000);

  console.log("Deploying OrderBook...");
  const orderBook = await retryWithBackoff(() =>
    ethers.deployContract("OrderBook", [deployer.address, jobRegistry.target])
  );
  await retryWithBackoff(() => orderBook.waitForDeployment());
  console.log(`OrderBook: ${orderBook.target}`);
  await delay(3000);

  console.log("Deploying AgentRegistry...");
  const agentRegistry = await retryWithBackoff(() =>
    ethers.deployContract("AgentRegistry", [deployer.address])
  );
  await retryWithBackoff(() => agentRegistry.waitForDeployment());
  console.log(`AgentRegistry: ${agentRegistry.target}`);

  const txOverrides = await buildTxOverrides(deployer.provider);

  // Send sequentially to avoid nonce collisions on Arc mempool
  console.log("\nWiring contracts together...");
  
  console.log("Setting OrderBook in JobRegistry...");
  await retryWithBackoff(() => jobRegistry.setOrderBook(orderBook.target, txOverrides));
  await delay(3000);
  
  console.log("Setting OrderBook in Escrow...");
  await retryWithBackoff(() => escrow.setOrderBook(orderBook.target, txOverrides));
  await delay(3000);
  
  console.log("Setting Reputation in Escrow...");
  await retryWithBackoff(() => escrow.setReputation(reputation.target, txOverrides));
  await delay(3000);
  
  console.log("Setting Escrow in ReputationToken...");
  await retryWithBackoff(() => reputation.setEscrow(escrow.target, txOverrides));
  await delay(3000);
  
  console.log("Setting AgentRegistry in ReputationToken...");
  await retryWithBackoff(() => reputation.setAgentRegistry(agentRegistry.target, txOverrides));
  await delay(3000);
  
  console.log("Setting ReputationOracle in AgentRegistry...");
  await retryWithBackoff(() => agentRegistry.setReputationOracle(reputation.target, txOverrides));
  await delay(3000);
  
  console.log("Setting Escrow in OrderBook...");
  await retryWithBackoff(() => orderBook.setEscrow(escrow.target, txOverrides));
  await delay(3000);
  
  console.log("Setting ReputationToken in OrderBook...");
  await retryWithBackoff(() => orderBook.setReputationToken(reputation.target, txOverrides));
  await delay(3000);
  
  console.log("Setting AgentRegistry in OrderBook...");
  await retryWithBackoff(() => orderBook.setAgentRegistry(agentRegistry.target, txOverrides));
  await delay(2000);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
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
  
  // Save timestamped version
  const timestampedPath = path.join(deploymentsDir, `arc-${deploymentRecord.chainId}-${timestamp}.json`);
  await fs.writeFile(timestampedPath, JSON.stringify(deploymentRecord, null, 2));
  
  // Save latest version (overwrites)
  const latestPath = path.join(deploymentsDir, `arc-${deploymentRecord.chainId}.json`);
  await fs.writeFile(latestPath, JSON.stringify(deploymentRecord, null, 2));

  console.log("Deployment saved to:");
  console.log("  Timestamped:", timestampedPath);
  console.log("  Latest:", latestPath);
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
