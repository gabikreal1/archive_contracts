# A2A Marketplace Contracts

Smart contracts for the Arc Testnet agent-to-agent marketplace described in the PRDs. The system covers job posting/bidding, USDC escrow, agent registration, and on-chain reputation.

## Stack
- Hardhat + TypeScript
- Solidity `^0.8.24`
- OpenZeppelin Contracts `^5.x`
- Ethers.js v6 tooling

## Prerequisites
- Node.js 18+
- npm 9+
- Arc testnet RPC endpoint (Circle or provided gateway)
- A funded Arc wallet private key with gas & USDC

## Setup
```powershell
cd contracts
npm install
cp .env.example .env
```
Fill `.env`:
```
ARC_RPC_URL=https://...
ARC_PRIVATE_KEY=0x...
USDC_TOKEN_ADDRESS=0x...
ARC_CHAIN_ID=12345   # optional override
```

## Helpful Scripts
- `npx hardhat test` – run unit tests (see `test/orderbook.ts`).
- `npx hardhat compile` – build artifacts.
- `npx hardhat run scripts/createWallet.ts` – mint a fresh wallet for Arc testnet funding.
- `npx hardhat run scripts/deploy.ts --network arc` – deploy full suite to Arc.

`hardhat.config.ts` already wires the `arc` network to env vars. Update the RPC URL/private key before deploying.

### Gas Management
- By default the deploy script auto-detects Arc gas fees via `provider.getFeeData()` and bumps them by ~50% to avoid underpriced replacements.
- To force a fixed gas budget, set `ARC_TX_GWEI=0.05` (or similar) in your `.env` and redeploy.

## Deployment Output
`scripts/deploy.ts` now persists every deployment to `deployments/arc-<chainId>.json`:
```json
{
  "network": "arc-testnet",
  "chainId": 12345,
  "deployedAt": "2025-11-15T14:00:00.000Z",
  "deployer": "0x...",
  "usdc": "0x...",
  "contracts": {
    "JobRegistry": "0x...",
    "ReputationToken": "0x...",
    "Escrow": "0x...",
    "OrderBook": "0x...",
    "AgentRegistry": "0x..."
  }
}
```
Share the resulting JSON (and/or the `BACKEND_HANDOFF.md` file) with backend + frontend teams.

## Testing Locally
```powershell
npx hardhat test
```
The happy-path suite spins up MockUSDC, registers an agent, runs bidding, delivery, escrow settlement, and confirms reputation accrual.

## Deploying to Arc Testnet
```powershell
npx hardhat run scripts/deploy.ts --network arc
```
1. Ensure `ARC_RPC_URL`, `ARC_PRIVATE_KEY`, and `USDC_TOKEN_ADDRESS` are set.
2. Fund the deployer wallet with Arc native gas + test USDC.
3. After deployment, grab addresses from `deployments/arc-<chainId>.json` and update `BACKEND_HANDOFF.md` plus any backend `.env` configs.

## Next Steps
- Integrate addresses/ABIs into the NestJS backend blockchain module.
- Configure Circle wallet approvals to point at the deployed `Escrow` contract.
- Expand tests to cover failure/refund logic once dispute flows are ready.
