// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./JobTypes.sol";

interface IJobRegistry {
    function upsertJob(JobTypes.JobMetadata memory job, JobTypes.JobStatus status) external;
    function updateJobStatus(uint256 jobId, JobTypes.JobStatus status) external;
    function indexBid(JobTypes.BidMetadata memory bid) external;
    function indexDelivery(JobTypes.DeliveryReceipt memory receipt) external;
}

interface IEscrow {
    function lockFunds(uint256 jobId, address user, address agent, uint256 amount) external;
    function releasePayment(uint256 jobId) external;
    function refund(uint256 jobId) external;
}

interface IReputationToken {
    function scoreOf(address agent) external view returns (uint256);
}

interface IAgentRegistryView {
    function isAgentActive(address wallet) external view returns (bool);
}

contract OrderBook is Ownable {
    using JobTypes for JobTypes.JobStatus;

    struct JobState {
        address poster;
        JobTypes.JobStatus status;
        uint256 acceptedBidId;
        bytes32 deliveryProof;
    }

    struct Bid {
        uint256 id;
        uint256 jobId;
        address bidder;
        uint256 price;
        uint64 deliveryTime;
        uint256 reputation;
        string metadataURI;
        bool accepted;
        uint256 createdAt;
    }

    uint256 private nextJobId = 1;
    uint256 private nextBidId = 1;

    mapping(uint256 => JobState) private jobStates;
    mapping(uint256 => Bid) private bidsById;
    mapping(uint256 => uint256[]) private jobBidIds;

    IJobRegistry public jobRegistry;
    IEscrow public escrow;
    IReputationToken public reputationToken;
    IAgentRegistryView public agentRegistry;

    event JobPosted(uint256 indexed jobId, address indexed poster);
    event BidPlaced(uint256 indexed jobId, uint256 indexed bidId, address bidder, uint256 price);
    event BidAccepted(uint256 indexed jobId, uint256 indexed bidId, address poster, address agent);
    event DeliverySubmitted(uint256 indexed jobId, uint256 indexed bidId, bytes32 proofHash);
    event JobApproved(uint256 indexed jobId, uint256 indexed bidId);

    constructor(address initialOwner, IJobRegistry registry) Ownable(initialOwner) {
        jobRegistry = registry;
    }

    function setEscrow(address escrowAddress) external onlyOwner {
        escrow = IEscrow(escrowAddress);
    }

    function setReputationToken(address reputationAddress) external onlyOwner {
        reputationToken = IReputationToken(reputationAddress);
    }

    function setAgentRegistry(address registry) external onlyOwner {
        agentRegistry = IAgentRegistryView(registry);
    }

    function postJob(
        string calldata description,
        string calldata metadataURI,
        string[] calldata tags,
        uint64 deadline
    ) external returns (uint256 jobId) {
        jobId = nextJobId++;
        jobStates[jobId] = JobState({
            poster: msg.sender,
            status: JobTypes.JobStatus.OPEN,
            acceptedBidId: 0,
            deliveryProof: bytes32(0)
        });

        string[] memory tagsCopy = tags;
        JobTypes.JobMetadata memory meta = JobTypes.JobMetadata({
            id: jobId,
            poster: msg.sender,
            description: description,
            metadataURI: metadataURI,
            tags: tagsCopy,
            deadline: deadline,
            createdAt: block.timestamp
        });
        jobRegistry.upsertJob(meta, JobTypes.JobStatus.OPEN);
        emit JobPosted(jobId, msg.sender);
    }

    function placeBid(
        uint256 jobId,
        uint256 price,
        uint64 deliveryTime,
        string calldata metadataURI
    ) external returns (uint256 bidId) {
        JobState storage job = jobStates[jobId];
        require(job.poster != address(0), "OrderBook: job not found");
        require(job.status == JobTypes.JobStatus.OPEN, "OrderBook: job not open");
        if (address(agentRegistry) != address(0)) {
            require(agentRegistry.isAgentActive(msg.sender), "OrderBook: agent not active");
        }

        uint256 rep = address(reputationToken) != address(0)
            ? reputationToken.scoreOf(msg.sender)
            : 0;

        bidId = nextBidId++;
        Bid storage bid = bidsById[bidId];
        bid.id = bidId;
        bid.jobId = jobId;
        bid.bidder = msg.sender;
        bid.price = price;
        bid.deliveryTime = deliveryTime;
        bid.reputation = rep;
        bid.metadataURI = metadataURI;
        bid.createdAt = block.timestamp;

        jobBidIds[jobId].push(bidId);

        string memory metaCopy = metadataURI;
        JobTypes.BidMetadata memory indexedBid = JobTypes.BidMetadata({
            id: bidId,
            jobId: jobId,
            bidder: msg.sender,
            price: price,
            deliveryTime: deliveryTime,
            reputation: rep,
            metadataURI: metaCopy,
            accepted: false,
            createdAt: block.timestamp
        });
        jobRegistry.indexBid(indexedBid);
        emit BidPlaced(jobId, bidId, msg.sender, price);
    }

    function acceptBid(uint256 jobId, uint256 bidId) external {
        JobState storage job = jobStates[jobId];
        require(job.poster == msg.sender, "OrderBook: not poster");
        require(job.status == JobTypes.JobStatus.OPEN, "OrderBook: job not open");

        Bid storage bid = bidsById[bidId];
        require(bid.jobId == jobId, "OrderBook: mismatched bid");
        require(!bid.accepted, "OrderBook: bid already accepted");
        require(address(escrow) != address(0), "OrderBook: escrow not set");

        bid.accepted = true;
        job.status = JobTypes.JobStatus.IN_PROGRESS;
        job.acceptedBidId = bidId;

        jobRegistry.updateJobStatus(jobId, JobTypes.JobStatus.IN_PROGRESS);
        escrow.lockFunds(jobId, msg.sender, bid.bidder, bid.price);

        emit BidAccepted(jobId, bidId, msg.sender, bid.bidder);
    }

    function submitDelivery(uint256 jobId, bytes32 proofHash) external {
        JobState storage job = jobStates[jobId];
        require(job.status == JobTypes.JobStatus.IN_PROGRESS, "OrderBook: job not in progress");
        Bid storage bid = bidsById[job.acceptedBidId];
        require(bid.bidder == msg.sender, "OrderBook: not winning agent");

        job.status = JobTypes.JobStatus.DELIVERED;
        job.deliveryProof = proofHash;
        jobRegistry.updateJobStatus(jobId, JobTypes.JobStatus.DELIVERED);

        JobTypes.DeliveryReceipt memory receipt = JobTypes.DeliveryReceipt({
            jobId: jobId,
            proofHash: proofHash,
            deliveredAt: block.timestamp
        });
        jobRegistry.indexDelivery(receipt);
        emit DeliverySubmitted(jobId, job.acceptedBidId, proofHash);
    }

    function approveDelivery(uint256 jobId) external {
        JobState storage job = jobStates[jobId];
        require(job.poster == msg.sender, "OrderBook: not poster");
        require(job.status == JobTypes.JobStatus.DELIVERED, "OrderBook: job not delivered");

        job.status = JobTypes.JobStatus.COMPLETED;
        jobRegistry.updateJobStatus(jobId, JobTypes.JobStatus.COMPLETED);
        escrow.releasePayment(jobId);
        emit JobApproved(jobId, job.acceptedBidId);
    }

    function refundJob(uint256 jobId) external {
        JobState storage job = jobStates[jobId];
        require(job.poster == msg.sender || msg.sender == owner(), "OrderBook: not authorized");
        require(job.status == JobTypes.JobStatus.IN_PROGRESS || job.status == JobTypes.JobStatus.DELIVERED, "OrderBook: cannot refund");

        job.status = JobTypes.JobStatus.DISPUTED;
        jobRegistry.updateJobStatus(jobId, JobTypes.JobStatus.DISPUTED);
        escrow.refund(jobId);
    }

    function getJob(uint256 jobId) external view returns (JobState memory job, Bid[] memory jobBids) {
        job = jobStates[jobId];
        uint256[] storage bidIds = jobBidIds[jobId];
        jobBids = new Bid[](bidIds.length);
        for (uint256 i = 0; i < bidIds.length; i++) {
            jobBids[i] = bidsById[bidIds[i]];
        }
    }
}
