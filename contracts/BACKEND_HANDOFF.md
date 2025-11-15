# Backend Integration Package

This doc is meant for the NestJS/backend team to plug the latest Arc testnet contracts into their services.

## How to Retrieve Addresses
1. Run the deploy script after setting env vars:
   ```powershell
   npx hardhat run scripts/deploy.ts --network arc
   ```
2. The script writes `deployments/arc-<chainId>.json` containing every contract.
3. Copy the addresses below (and into your backend `.env`) immediately after deployment.

> **Note:** The placeholders below should be replaced with the actual addresses from the JSON file.

## Arc Testnet Addresses
**Deployed:** 2025-11-15T16:19:43.842Z  
**Deployer:** `0xe591C6eb0D83936fdCB633afEDD57ec76cCC006C`  
**Chain ID:** 5042002

| Contract | Address | Purpose | ABI artifact |
| --- | --- | --- | --- |
| AgentRegistry | `0x5a498B16049eb12A7DFF16f8fD94F94CD86466dB` | Agent identity, metadata, capabilities | `artifacts/contracts/AgentRegistry.sol/AgentRegistry.json` |
| OrderBook | `0xE345603d32AC0584336b9efFeF8BBEE28Ec2A34e` | Job posting, bidding, delivery approvals | `artifacts/contracts/OrderBook.sol/OrderBook.json` |
| Escrow | `0x371cAb74d5Eaf35A4bc81dC1B444267F0debDf58` | Holds USDC, releases/refunds funds + reputation hooks | `artifacts/contracts/Escrow.sol/Escrow.json` |
| JobRegistry | `0x9c7989cAbF4d6DB39844c185BE25922448D2b60F` | Read-optimized index of jobs/bids/deliveries | `artifacts/contracts/JobRegistry.sol/JobRegistry.json` |
| ReputationToken | `0xe8E554AD957734AF1C5d3411E45b1596bBf2AE6D` | Non-transferable scoring + stats | `artifacts/contracts/ReputationToken.sol/ReputationToken.json` |
| USDC Token | `0x3600000000000000000000000000000000000000` | Circle/Arc USDC token reference | External (Arc explorer) |

After populating, commit this file (or send to backend privately) so everyone converges on the same deployment addresses/ABIs.

## Suggested Backend Env Keys
```
ORDERBOOK_ADDRESS=0xE345603d32AC0584336b9efFeF8BBEE28Ec2A34e
ESCROW_ADDRESS=0x371cAb74d5Eaf35A4bc81dC1B444267F0debDf58
AGENT_REGISTRY_ADDRESS=0x5a498B16049eb12A7DFF16f8fD94F94CD86466dB
JOB_REGISTRY_ADDRESS=0x9c7989cAbF4d6DB39844c185BE25922448D2b60F
REPUTATION_TOKEN_ADDRESS=0xe8E554AD957734AF1C5d3411E45b1596bBf2AE6D
USDC_TOKEN_ADDRESS=0x3600000000000000000000000000000000000000
ARC_RPC_URL=<your-arc-rpc-url>
ARC_CHAIN_ID=5042002
```

## Quick Integration Checklist
- [ ] Import the matching ABI JSON file for each contract.
- [ ] Instantiate ethers Contract objects with the Arc RPC provider.
- [ ] Subscribe to `JobPosted`, `BidPlaced`, `BidAccepted`, `DeliverySubmitted`, and `PaymentReleased` events for real-time cache updates.
- [ ] Use `Escrow` address for Circle wallet approvals (`approveUSDC(escrow, amount)`).
- [ ] Update reputation fetch endpoints to read from `ReputationToken.scoreOf` (single value) or `statsOf` (detailed stats).

Keep this file updated whenever you redeploy to a new network or roll a hotfix.
