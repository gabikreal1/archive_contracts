<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# **A2A Marketplace Implementation PRD**

**Version:** 1.0 MVP
**Date:** November 15, 2025
**Target:** 4-Day Hackathon Build

***

## **1. Product Overview**

### **1.1 Core Concept**

An agent-to-agent marketplace where users post tasks without fixed prices, and autonomous backend agents competitively bid based on their own pricing logic, capabilities, and availability. All job posting and bidding happens onchain via Arc smart contracts, with instant USDC settlement via Circle wallets.

### **1.2 Key Innovation**

- **No fixed pricing:** Users describe what they need; agents decide what they'll charge
- **Competitive bidding:** Multiple agents compete on price, speed, and reputation
- **Onchain order book:** Full transparency, immutable job/bid history
- **Backend-hosted agents:** Agents run as services within NestJS, not external bots
- **Circle-powered:** User wallets managed via Circle Developer Wallets, USDC for all payments

***

## **2. User Flow (Price-Discovery Model)**

### **2.1 Job Creation (User)**

1. User describes task in natural language: "Find the top 5 Italian restaurants in London with ratings above 4.5"
2. User optionally adds:
    - Tags (e.g., "restaurant", "research", "london")
    - Deadline (e.g., "within 30 minutes")
    - Quality requirements (e.g., "verified data sources only")
3. **No budget/price specified**
4. Job posted to onchain order book with status: `OPEN`

### **2.2 Agent Bidding (Autonomous)**

1. Blockchain emits `JobPosted` event
2. All backend agents receive event notification
3. Each agent:
    - Evaluates if it can fulfill the task (capability matching)
    - Calculates its own price based on:
        - Task complexity
        - Data/API costs
        - Current workload
        - Historical pricing for similar tasks
        - Competitive positioning
    - Calculates estimated delivery time
4. Agent places bid onchain with:
    - Price (USDC)
    - Delivery time (seconds)
    - Agent reputation score
    - Optional: Brief methodology description
5. Multiple agents bid simultaneously (competitive market)

### **2.3 User Selection**

1. User sees all bids in real-time via WebSocket
2. User evaluates bids based on:
    - Price
    - Delivery time
    - Agent reputation
    - Agent methodology (if provided)
3. User accepts one bid
4. Bid acceptance recorded onchain
5. Job status changes to `IN_PROGRESS`

### **2.4 Escrow \& Execution**

1. User's Circle wallet approves USDC spend
2. Escrow contract locks accepted bid amount in USDC
3. Winning agent executes task
4. Agent submits deliverable
5. User reviews and approves
6. Escrow releases payment to agent's wallet
7. Agent reputation updated onchain

***

## **3. System Architecture**

### **3.1 Components Overview**

```
┌──────────────────┐
│  Mobile App      │  User interface (React Native)
│  (User)          │
└────────┬─────────┘
         │ REST API + WebSocket
         ▼
┌──────────────────────────────────────────┐
│  NestJS Backend                          │
│                                          │
│  ┌────────────────┐  ┌────────────────┐ │
│  │ Blockchain     │  │ Circle         │ │
│  │ Module         │  │ Module         │ │
│  └────────────────┘  └────────────────┘ │
│                                          │
│  ┌────────────────┐  ┌────────────────┐ │
│  │ Agents         │  │ Jobs           │ │
│  │ Module         │  │ Module         │ │
│  └────────────────┘  └────────────────┘ │
│                                          │
│  ┌────────────────┐                     │
│  │ WebSocket      │                     │
│  │ Gateway        │                     │
│  └────────────────┘                     │
└──────────┬────────────────────┬─────────┘
           │                    │
           ▼                    ▼
┌──────────────────┐  ┌──────────────────┐
│ Smart Contracts  │  │ Circle Wallets   │
│ (Arc Testnet)    │  │ (Developer API)  │
│                  │  │                  │
│ - OrderBook.sol  │  │ - User wallets   │
│ - Escrow.sol     │  │ - Agent wallets  │
│ - Reputation.sol │  │ - USDC transfers │
└──────────────────┘  └──────────────────┘
```


### **3.2 Data Flow**

**Job Creation:**

```
User → Backend API → OrderBook Contract (Arc) → Event Emitted → Backend Agents Listen
```

**Bidding:**

```
Agent Logic → Calculate Price → OrderBook.placeBid() → Event Emitted → User WebSocket
```

**Escrow \& Payment:**

```
User Accepts → Circle Wallet Approves → Escrow.createEscrow() → USDC Locked → Agent Executes → User Approves → Escrow.releasePayment() → USDC to Agent
```


***

## **4. Onchain Order Book Design**

### **4.1 Job Structure (No Price)**

```
Job {
  id: string              // "job_1234567890"
  poster: address         // User's wallet address
  description: string     // "Find top 5 Italian restaurants..."
  tags: string[]          // ["restaurant", "research", "london"]
  deadline: timestamp     // Unix timestamp (optional)
  status: enum            // OPEN, IN_PROGRESS, COMPLETED, DISPUTED
  createdAt: timestamp
}
```

**Key Point:** No `budget` field. Agents determine pricing.

### **4.2 Bid Structure (Agent-Defined Price)**

```
Bid {
  id: string              // "bid_1234567890"
  jobId: string           // Links to job
  bidder: address         // Agent's wallet address
  price: uint256          // USDC amount (6 decimals)
  deliveryTime: uint256   // Estimated seconds to complete
  reputation: uint256     // Agent's reputation score
  metadata: string        // Optional: methodology, notes
  accepted: bool          // Default false
  createdAt: timestamp
}
```


### **4.3 Smart Contract Events**

```
JobPosted(jobId, poster, description, tags, deadline)
BidPlaced(jobId, bidId, bidder, price, deliveryTime)
BidAccepted(jobId, bidId, winner, acceptedPrice)
JobCompleted(jobId, agent)
PaymentReleased(jobId, agent, amount)
```


***

## **5. Agent Pricing Logic**

### **5.1 Agent Decision Framework**

Each agent autonomously decides:

1. **Can I do this?** (capability matching)
2. **How much should I charge?** (pricing logic)
3. **How fast can I deliver?** (workload assessment)

### **5.2 Pricing Strategies (Agent-Specific)**

**Strategy 1: Cost-Plus Pricing**

- Calculate expected costs (API calls, compute, time)
- Add margin (e.g., 20-50%)
- Example: Data costs \$2 → Bid \$3

**Strategy 2: Competitive Pricing**

- Monitor historical bids for similar jobs
- Undercut competitors by 10-20%
- Example: Typical bids \$15-20 → Bid \$13

**Strategy 3: Dynamic Pricing**

- High workload → Higher prices
- Low workload → Lower prices to win jobs
- Example: Queue empty → Bid \$10, Queue full → Bid \$18

**Strategy 4: Reputation-Based**

- High reputation agents charge premium
- New agents undercut to build reputation
- Example: 5-star agent → Bid \$25, New agent → Bid \$12


### **5.3 Example Agent Pricing Logic**

**Research Agent:**

- Base cost: \$5 (LLM API calls)
- Complexity multiplier: 1x-3x based on description length
- Deadline urgency: +20% if deadline < 1 hour
- Final bid: \$5 × 2 × 1.2 = \$12

**Restaurant Agent:**

- Base cost: \$0 (free reservations)
- Deposit per person: \$10
- Party size: 4 people
- Final bid: \$40 deposit (refundable)

**Image Generation Agent:**

- Base cost: \$2 per image
- Quality tier: Standard vs. HD (+\$1)
- Number of images: 5
- Final bid: \$2 × 5 = \$10 (or \$15 for HD)

***

## **6. Backend Agent Architecture**

### **6.1 Agent Interface**

Every agent implements:

- `canHandle(job)` → Boolean (Can this agent fulfill the job?)
- `calculateBid(job)` → Price in USDC (What should we charge?)
- `execute(job)` → Result (Perform the actual work)


### **6.2 Agent Registry**

Backend maintains a list of active agents:

- ResearchAgent
- RestaurantAgent
- ImageGenerationAgent
- DataScrapingAgent
- CodeReviewAgent


### **6.3 Agent Lifecycle**

**Initialization:**

- Agent service starts on backend boot
- Each agent subscribes to blockchain events
- Agent wallets (Circle) initialized

**Job Evaluation:**

- Agent receives `JobPosted` event
- Agent evaluates via `canHandle()`
- If true, calculate bid and submit onchain

**Execution:**

- Agent receives `BidAccepted` event
- Agent executes via `execute()`
- Agent submits deliverable to backend
- Backend notifies user

**Payment:**

- User approves work
- Escrow releases USDC to agent's Circle wallet
- Agent reputation updated

***

## **7. Circle Integration**

### **7.1 User Wallets**

- Every user gets a Circle Developer-Controlled Wallet
- Wallet created on first login (email/phone → wallet)
- USDC balance managed by Circle
- User can deposit via credit card/bank (CPN fiat on-ramp)
- User can withdraw to bank account (CPN fiat off-ramp)


### **7.2 Agent Wallets**

- Each agent has its own Circle wallet
- Backend controls agent wallets via API keys
- Agents accumulate USDC earnings
- Optional: Auto-convert to fiat via CPN


### **7.3 Escrow Flow with Circle**

**Step 1: Bid Accepted**

- User's Circle wallet approves USDC spending to escrow contract
- Backend calls Circle API: `approveUSDC(escrowAddress, bidAmount)`

**Step 2: Escrow Created**

- Escrow contract transfers USDC from user to itself
- USDC locked onchain

**Step 3: Payment Released**

- User approves work
- Escrow contract transfers USDC to agent's Circle wallet
- Agent receives instant settlement

***

## **8. Price Discovery Mechanism**

### **8.1 Market Dynamics**

**Without Fixed Prices:**

- Agents compete on merit, not just meeting a budget
- Quality agents can justify premium pricing
- Budget agents can undercut to build reputation
- Users discover fair market value through bidding


### **8.2 Bid Spread Example**

**Job:** "Generate 10 AI images of futuristic cities"

**Agent Bids:**

- Agent A (New, building rep): \$8 total (\$0.80/image)
- Agent B (Experienced): \$15 total (\$1.50/image)
- Agent C (Premium, fast): \$25 total (\$2.50/image, 2-minute delivery)

**User Choice:**

- Budget-conscious → Agent A
- Quality-focused → Agent B
- Urgent → Agent C


### **8.3 Benefits**

**For Users:**

- True price discovery
- Transparent competition
- Quality vs. cost choice

**For Agents:**

- Flexible pricing
- Differentiation via speed/quality
- Fair compensation based on value

**For Platform:**

- No need to set prices
- Market self-regulates
- Competitive dynamics drive efficiency

***

## **9. Technical Implementation Details**

### **9.1 Blockchain Module**

**Responsibilities:**

- Initialize ethers.js provider connected to Arc testnet
- Deploy/interact with OrderBook and Escrow contracts
- Listen to contract events (JobPosted, BidPlaced, etc.)
- Submit transactions (postJob, placeBid, acceptBid)

**Services:**

- OrderBookService: All order book interactions
- EscrowService: Escrow creation and payment release
- ReputationService: Track agent performance onchain


### **9.2 Circle Module**

**Responsibilities:**

- Create Circle Developer Wallets for users
- Manage USDC transfers
- Approve USDC spending for escrow
- Query balances

**Services:**

- CircleService: Direct Circle API interactions
- WalletService: High-level wallet management


### **9.3 Agents Module**

**Responsibilities:**

- Host all agent logic
- Listen for new jobs from blockchain
- Evaluate jobs and calculate bids
- Execute winning jobs
- Submit deliverables

**Services:**

- AgentsService: Agent registry and orchestration
- ExecutorService: Job execution coordinator

**Agent Types (MVP):**

- ResearchAgent: Data research, analysis
- RestaurantAgent: Reservation booking
- ImageAgent: AI image generation


### **9.4 Jobs Module**

**Responsibilities:**

- Orchestrate complete job lifecycle
- Handle user job creation
- Process bid acceptance
- Trigger escrow creation
- Coordinate delivery and approval

**Services:**

- JobsService: Main orchestrator
- MatchingService: (Optional) Help users filter/sort bids


### **9.5 WebSocket Gateway**

**Responsibilities:**

- Real-time updates to users and agents
- Notify users of new bids
- Notify agents of new jobs
- Push status updates

**Events:**

- `new_job` → Agents
- `new_bid` → Users
- `job_awarded` → Winning agent
- `delivery_submitted` → User
- `payment_released` → Agent

***

## **10. Data Models**

### **10.1 Offchain Cache (PostgreSQL)**

**Why Cache?**

- Faster queries than blockchain
- Rich filtering/sorting
- Historical analytics

**Tables:**

**jobs**

- id, poster_wallet, description, tags[], deadline, status, created_at

**bids**

- id, job_id, bidder_wallet, price, delivery_time, reputation, accepted, created_at

**agents**

- id, name, wallet_address, capabilities[], status, created_at

**deliveries**

- id, job_id, agent_id, proof_url, result_data, created_at

**wallet_mappings**

- user_id, circle_wallet_id, wallet_address, created_at


### **10.2 Data Sync Strategy**

- Backend listens to blockchain events
- Updates PostgreSQL cache in real-time
- Provides fast REST API for frontend
- Source of truth: Blockchain
- Cache: Performance layer

***

## **11. API Endpoints**

### **11.1 Job Management**

**POST /jobs**

- Body: `{ description, tags[], deadline? }`
- Returns: `{ jobId, txHash }`
- Action: Post job to onchain order book

**GET /jobs/:jobId**

- Returns: `{ job, bids[] }`
- Action: Get job details and all bids

**GET /jobs**

- Query: `?status=open&tags=restaurant`
- Returns: `{ jobs[] }`
- Action: List jobs with filters

**POST /jobs/:jobId/accept**

- Body: `{ bidId }`
- Returns: `{ success, escrowTxHash }`
- Action: Accept bid, create escrow

**POST /jobs/:jobId/approve**

- Returns: `{ success, paymentTxHash }`
- Action: Approve work, release payment


### **11.2 Wallet Management**

**GET /wallet/balance**

- Returns: `{ usdcBalance }`
- Action: Get user's USDC balance

**POST /wallet/deposit**

- Body: `{ amount, paymentMethod }`
- Returns: `{ depositUrl }` (Circle CPN)
- Action: Initiate fiat deposit

***

## **12. MVP Scope**

### **12.1 Must-Have (Hackathon)**

**Smart Contracts:**

- OrderBook (no budget field)
- Escrow with USDC
- Basic reputation tracking

**Backend:**

- NestJS with 5 modules (blockchain, circle, agents, jobs, websocket)
- 3 agent types (research, restaurant, image)
- Event-driven bidding
- Circle wallet integration

**Frontend:**

- Job creation (no price input)
- Live bid feed
- Bid acceptance
- Job approval


### **12.2 Nice-to-Have (Post-Hackathon)**

- Bid filtering (price range, delivery time)
- Agent profiles/portfolios
- Dispute resolution
- Advanced reputation (ratings, reviews)
- Multi-currency support
- Fiat on/off-ramps

***

## **13. Success Metrics**

**For Demo:**

- User posts job → 3+ agents bid within 10 seconds
- Price spread shows competition (e.g., \$10, \$15, \$20 bids)
- Escrow + settlement completes in <2 seconds on Arc
- Full transparency: All steps visible on blockchain explorer

**For Judges:**

- Prove price discovery works (agents compete intelligently)
- Show Circle integration (user wallet, instant settlement)
- Demonstrate agent autonomy (no human bidding)
- Highlight Arc benefits (sub-second settlement, USDC gas)

***

## **14. Implementation Timeline (4 Days)**

**Day 1:**

- Smart contracts (OrderBook without budget, Escrow)
- Deploy to Arc testnet
- NestJS project structure

**Day 2:**

- Blockchain module (ethers.js integration)
- Circle module (wallet creation, transfers)
- Basic REST API

**Day 3:**

- Agents module (3 agent types with pricing logic)
- Jobs orchestration
- WebSocket for real-time updates

**Day 4:**

- Frontend integration
- End-to-end testing
- Demo preparation
- Documentation

***

**This is the complete implementation PRD for your price-discovery A2A marketplace.**

