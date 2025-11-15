import { ethers } from "hardhat";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

async function main() {
  const [deployer] = await ethers.getSigners();
  const usdcAddress = process.env.USDC_TOKEN_ADDRESS;

  if (!usdcAddress) {
    throw new Error("USDC_TOKEN_ADDRESS missing in env");
  }

  console.log(`Deploying with ${deployer.address}`);

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

  await Promise.all([
    jobRegistry.setOrderBook(orderBook.target),
    escrow.setOrderBook(orderBook.target),
    escrow.setReputation(reputation.target),
    reputation.setEscrow(escrow.target),
    reputation.setAgentRegistry(agentRegistry.target),
    agentRegistry.setReputationOracle(reputation.target),
    orderBook.setEscrow(escrow.target),
    orderBook.setReputationToken(reputation.target),
    orderBook.setAgentRegistry(agentRegistry.target)
  ]);

  console.log("Contracts wired together. Update your frontend/backend configs with these addresses.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
