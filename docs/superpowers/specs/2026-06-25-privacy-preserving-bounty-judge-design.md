# Privacy-Preserving AI Bounty Judge Design

## Objective

Replace plaintext bounty submissions with a complete commit-reveal workflow. Participants commit a hash while submissions are open, reveal the answer only during a separate reveal window, and only valid revealed answers become eligible for the existing batched Ritual LLM review. The AI review remains advisory; the bounty owner makes the final winner decision.

## Scope

This implementation targets the assignment's required commit-reveal track. It updates the Solidity contract, Hardhat tests and deployment module, the Next.js frontend and ABI, and project documentation. TEE-encrypted advanced-track submissions are intentionally excluded so the submission remains testable and deployable without additional secret-management infrastructure.

## Contract Architecture

Each bounty stores two timestamps: `submissionDeadline` and `revealDeadline`, with the invariant `block.timestamp < submissionDeadline < revealDeadline`. Commitments are keyed by bounty and participant, so each wallet can enter once per bounty. A commitment is computed as:

```solidity
keccak256(abi.encode(answer, salt, msg.sender, bountyId))
```

`submitCommitment(uint256 bountyId, bytes32 commitment)` accepts nonzero commitments only before the submission deadline. `revealAnswer(uint256 bountyId, string calldata answer, bytes32 salt)` accepts reveals from the original committer after the submission deadline and before the reveal deadline. It rejects missing commitments, duplicate reveals, empty or oversized answers, and mismatched hashes. Successful reveals append a `Submission` containing the submitter and plaintext answer to the eligible submissions array.

`judgeAll(uint256 bountyId, bytes calldata llmInput)` remains owner-only and uses one Ritual LLM precompile call for the entire eligible batch. It is available only after the reveal deadline, with at least one valid reveal, and only once. `finalizeWinner(uint256 bountyId, uint256 winnerIndex)` remains owner-only, requires a completed AI review, validates the index before changing state, follows checks-effects-interactions, and pays the selected revealed submitter.

## Frontend Data Flow

During the submission phase, the participant enters an answer. The browser generates a cryptographically random 32-byte salt, computes the same ABI-encoded hash as Solidity, and persists the answer and salt locally under a key containing chain ID, contract address, bounty ID, and wallet address. The transaction submits only the hash.

During the reveal phase, the same wallet loads its locally stored answer and salt, displays a warning that losing browser data prevents reveal, and calls `revealAnswer`. The local draft is removed only after the reveal transaction is confirmed. The interface exposes phase-specific status and actions: commit, reveal, ready for judging, judged, and finalized.

The owner gathers only successfully revealed submissions for the existing batched LLM request. No individual LLM call is made per answer. The AI response is displayed as a recommendation, while the owner selects the final winner index.

## Public and Private Data

Commitment hashes, wallet addresses, bounty metadata, timestamps, revealed answers, AI output, winner selection, and payment are public on-chain. Before reveal, the plaintext answer and salt exist only in the participant's browser storage; the contract stores only the commitment. This required-track design does not protect answers after reveal because ordinary EVM state and calldata are public.

## Error Handling and Security

- Reject nonexistent bounties and invalid phase transitions.
- Reject zero commitments and more than one commitment per address per bounty.
- Bind commitments to the answer, salt, sender, and bounty ID to prevent replay across users or bounties.
- Reject reveals from another address, duplicate reveals, hash mismatches, empty answers, and answers above `MAX_ANSWER_LENGTH`.
- Enforce `MAX_SUBMISSIONS` at commitment time so the reveal array cannot exceed the bound.
- Allow judging only after the reveal window and only with valid revealed submissions.
- Validate `winnerIndex` before mutating finalization state.
- Preserve owner-only judging and final winner authority.
- Remove browser secrets only after confirmed reveal and never log them.

## Testing Strategy

Hardhat tests will be written before implementation and will prove the red-green cycle for each contract behavior. Coverage includes bounty deadline validation, successful commitment and reveal, phase boundaries, duplicate commitment/reveal, sender and bounty binding, wrong salt or answer, answer length constraints, judging gates, authorization, replay prevention, winner index validation, one-time finalization, and reward payment. Frontend tests will cover commitment calculation, local draft serialization, phase derivation, and clearing secrets only after confirmed reveal. Compilation, type checking, contract tests, frontend linting, and frontend build must all pass before completion.

## Deployment and Submission Evidence

Hardhat configuration will include Ritual Chain (`chainId` 1979) and use a private key supplied through an environment variable or Hardhat keystore; secrets will not be committed. The Ignition deployment module deploys `AIJudge`. A successful network deployment must produce the contract address and deployment transaction hash required by the Discord form. The final README records exact test and deployment commands, the lifecycle, architecture notes, a reveal-case test plan, and the required 5-8 sentence reflection.

Deployment depends on the user's wallet having Ritual testnet funds and a private key available locally. If those credentials are unavailable, all code and verification can still be completed, but genuine address and transaction evidence cannot be fabricated.
