// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PrecompileConsumer} from "./utils/PrecompileConsumer.sol";

contract AIJudge is PrecompileConsumer {
    uint256 public constant MAX_SUBMISSIONS = 10;
    uint256 public constant MAX_ANSWER_LENGTH = 2_000;

    uint256 public nextBountyId = 1;

    struct Submission {
        address submitter;
        string answer;
    }

    struct CommitmentRecord {
        bytes32 commitment;
        bool revealed;
    }

    struct Bounty {
        address owner;
        string title;
        string rubric;
        uint256 reward;
        uint256 submissionDeadline;
        uint256 revealDeadline;
        uint256 commitmentCount;
        bool judged;
        bool finalized;
        bytes aiReview;
        uint256 winnerIndex;
        Submission[] submissions;
    }

    struct ConvoHistory {
        string storageType;
        string path;
        string secretsName;
    }

    mapping(uint256 => Bounty) private bounties;
    mapping(uint256 => mapping(address => CommitmentRecord)) private commitments;

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed owner,
        string title,
        uint256 reward,
        uint256 submissionDeadline,
        uint256 revealDeadline
    );
    event CommitmentSubmitted(
        uint256 indexed bountyId,
        address indexed submitter,
        bytes32 commitment
    );
    event AnswerRevealed(
        uint256 indexed bountyId,
        uint256 indexed submissionIndex,
        address indexed submitter
    );
    event AllAnswersJudged(uint256 indexed bountyId, bytes aiReview);
    event WinnerFinalized(
        uint256 indexed bountyId,
        uint256 indexed winnerIndex,
        address indexed winner,
        uint256 reward
    );

    modifier onlyOwner(uint256 bountyId) {
        require(msg.sender == bounties[bountyId].owner, "not bounty owner");
        _;
    }

    modifier bountyExists(uint256 bountyId) {
        require(bounties[bountyId].owner != address(0), "bounty not found");
        _;
    }

    function createBounty(
        string calldata title,
        string calldata rubric,
        uint256 submissionDeadline,
        uint256 revealDeadline
    ) external payable returns (uint256 bountyId) {
        require(msg.value > 0, "reward required");
        require(
            submissionDeadline > block.timestamp,
            "submission deadline must be future"
        );
        require(
            revealDeadline > submissionDeadline,
            "reveal deadline must follow submission"
        );

        bountyId = nextBountyId++;
        Bounty storage bounty = bounties[bountyId];
        bounty.owner = msg.sender;
        bounty.title = title;
        bounty.rubric = rubric;
        bounty.reward = msg.value;
        bounty.submissionDeadline = submissionDeadline;
        bounty.revealDeadline = revealDeadline;
        bounty.winnerIndex = type(uint256).max;

        emit BountyCreated(
            bountyId,
            msg.sender,
            title,
            msg.value,
            submissionDeadline,
            revealDeadline
        );
    }

    function submitCommitment(
        uint256 bountyId,
        bytes32 commitment
    ) external bountyExists(bountyId) {
        Bounty storage bounty = bounties[bountyId];
        CommitmentRecord storage record = commitments[bountyId][msg.sender];

        require(block.timestamp < bounty.submissionDeadline, "submissions closed");
        require(!bounty.judged && !bounty.finalized, "bounty closed");
        require(commitment != bytes32(0), "commitment required");
        require(record.commitment == bytes32(0), "already committed");
        require(bounty.commitmentCount < MAX_SUBMISSIONS, "too many submissions");

        record.commitment = commitment;
        bounty.commitmentCount++;

        emit CommitmentSubmitted(bountyId, msg.sender, commitment);
    }

    function revealAnswer(
        uint256 bountyId,
        string calldata answer,
        bytes32 salt
    ) external bountyExists(bountyId) {
        Bounty storage bounty = bounties[bountyId];
        CommitmentRecord storage record = commitments[bountyId][msg.sender];

        require(block.timestamp >= bounty.submissionDeadline, "reveal not started");
        require(block.timestamp < bounty.revealDeadline, "reveal closed");
        require(record.commitment != bytes32(0), "no commitment");
        require(!record.revealed, "already revealed");
        require(bytes(answer).length > 0, "answer required");
        require(bytes(answer).length <= MAX_ANSWER_LENGTH, "answer too long");
        require(
            record.commitment == computeCommitment(answer, salt, msg.sender, bountyId),
            "commitment mismatch"
        );

        record.revealed = true;
        bounty.submissions.push(Submission({submitter: msg.sender, answer: answer}));

        emit AnswerRevealed(
            bountyId,
            bounty.submissions.length - 1,
            msg.sender
        );
    }

    function computeCommitment(
        string calldata answer,
        bytes32 salt,
        address submitter,
        uint256 bountyId
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(answer, salt, submitter, bountyId));
    }

    function judgeAll(
        uint256 bountyId,
        bytes calldata llmInput
    ) external bountyExists(bountyId) onlyOwner(bountyId) {
        Bounty storage bounty = bounties[bountyId];
        require(block.timestamp >= bounty.revealDeadline, "reveal still open");
        require(!bounty.judged, "already judged");
        require(!bounty.finalized, "already finalized");
        require(bounty.submissions.length > 0, "no revealed submissions");

        bytes memory output = _runLlm(llmInput);
        (
            bool hasError,
            bytes memory completionData,
            ,
            string memory errorMessage,

        ) = abi.decode(output, (bool, bytes, bytes, string, ConvoHistory));
        require(!hasError, errorMessage);

        bounty.judged = true;
        bounty.aiReview = completionData;
        emit AllAnswersJudged(bountyId, completionData);
    }

    function _runLlm(bytes calldata llmInput) internal virtual returns (bytes memory) {
        return _executePrecompile(LLM_INFERENCE_PRECOMPILE, llmInput);
    }

    function finalizeWinner(
        uint256 bountyId,
        uint256 winnerIndex
    ) external bountyExists(bountyId) onlyOwner(bountyId) {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.judged, "not judged yet");
        require(!bounty.finalized, "already finalized");
        require(winnerIndex < bounty.submissions.length, "invalid winner index");

        address winner = bounty.submissions[winnerIndex].submitter;
        uint256 reward = bounty.reward;
        bounty.finalized = true;
        bounty.winnerIndex = winnerIndex;
        bounty.reward = 0;

        (bool ok, ) = payable(winner).call{value: reward}("");
        require(ok, "payment failed");
        emit WinnerFinalized(bountyId, winnerIndex, winner, reward);
    }

    function getCommitment(
        uint256 bountyId,
        address submitter
    ) external view bountyExists(bountyId) returns (bytes32 commitment, bool revealed) {
        CommitmentRecord storage record = commitments[bountyId][submitter];
        return (record.commitment, record.revealed);
    }

    function getBounty(
        uint256 bountyId
    )
        external
        view
        bountyExists(bountyId)
        returns (
            address owner,
            string memory title,
            string memory rubric,
            uint256 reward,
            uint256 submissionDeadline,
            uint256 revealDeadline,
            bool judged,
            bool finalized,
            uint256 winnerIndex,
            bytes memory aiReview
        )
    {
        Bounty storage bounty = bounties[bountyId];
        return (
            bounty.owner,
            bounty.title,
            bounty.rubric,
            bounty.reward,
            bounty.submissionDeadline,
            bounty.revealDeadline,
            bounty.judged,
            bounty.finalized,
            bounty.winnerIndex,
            bounty.aiReview
        );
    }

    function getBountyCounts(
        uint256 bountyId
    )
        external
        view
        bountyExists(bountyId)
        returns (uint256 commitmentCount, uint256 submissionCount)
    {
        Bounty storage bounty = bounties[bountyId];
        return (bounty.commitmentCount, bounty.submissions.length);
    }

    function getSubmission(
        uint256 bountyId,
        uint256 index
    ) external view bountyExists(bountyId) returns (address submitter, string memory answer) {
        Bounty storage bounty = bounties[bountyId];
        require(index < bounty.submissions.length, "invalid index");
        Submission storage submission = bounty.submissions[index];
        return (submission.submitter, submission.answer);
    }
}
