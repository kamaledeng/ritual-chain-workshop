import { parseAbi } from "viem";

const aiJudgeAbi = parseAbi([
  "event BountyCreated(uint256 indexed bountyId, address indexed owner, string title, uint256 reward, uint256 submissionDeadline, uint256 revealDeadline)",
  "event CommitmentSubmitted(uint256 indexed bountyId, address indexed submitter, bytes32 commitment)",
  "event AnswerRevealed(uint256 indexed bountyId, uint256 indexed submissionIndex, address indexed submitter)",
  "event AllAnswersJudged(uint256 indexed bountyId, bytes aiReview)",
  "event WinnerFinalized(uint256 indexed bountyId, uint256 indexed winnerIndex, address indexed winner, uint256 reward)",
  "function MAX_ANSWER_LENGTH() view returns (uint256)",
  "function MAX_SUBMISSIONS() view returns (uint256)",
  "function nextBountyId() view returns (uint256)",
  "function createBounty(string title, string rubric, uint256 submissionDeadline, uint256 revealDeadline) payable returns (uint256 bountyId)",
  "function submitCommitment(uint256 bountyId, bytes32 commitment)",
  "function revealAnswer(uint256 bountyId, string answer, bytes32 salt)",
  "function computeCommitment(string answer, bytes32 salt, address submitter, uint256 bountyId) pure returns (bytes32)",
  "function judgeAll(uint256 bountyId, bytes llmInput)",
  "function finalizeWinner(uint256 bountyId, uint256 winnerIndex)",
  "function getCommitment(uint256 bountyId, address submitter) view returns (bytes32 commitment, bool revealed)",
  "function getBounty(uint256 bountyId) view returns (address owner, string title, string rubric, uint256 reward, uint256 submissionDeadline, uint256 revealDeadline, bool judged, bool finalized, uint256 winnerIndex, bytes aiReview)",
  "function getBountyCounts(uint256 bountyId) view returns (uint256 commitmentCount, uint256 submissionCount)",
  "function getSubmission(uint256 bountyId, uint256 index) view returns (address submitter, string answer)",
]);

export default aiJudgeAbi;
