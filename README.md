# Privacy-Preserving AI Bounty Judge

This workshop project implements the required commit-reveal track for a fair AI-assisted bounty. Participants publish only a commitment hash during the submission phase, reveal the answer and salt in a later phase, and only valid reveals are included in one batched Ritual LLM review. The AI recommends a ranking; the bounty owner remains responsible for the final winner and reward payment.

## Architecture

- `hardhat/contracts/AIJudge.sol` owns bounty funds, deadlines, commitments, reveal verification, batched LLM judging, and winner finalization.
- `web/src/lib/commitReveal.ts` generates a cryptographically random salt, computes the Solidity-compatible hash, and stores the unrevealed answer locally.
- `web/src/lib/ritualLlm.ts` encodes the canonical 30-field request for Ritual's `0x0802` LLM precompile using `zai-org/GLM-4.7-FP8`.
- `web/src/lib/aiReview.ts` decodes Ritual's nested ABI `CompletionData` and extracts the model's JSON recommendation.
- The Ritual TEE executor performs inference, but ordinary commit-reveal privacy ends when a participant reveals on-chain.

## Lifecycle

1. The owner creates a funded bounty with `submissionDeadline < revealDeadline`.
2. A participant's browser generates a 32-byte salt and computes:

   ```solidity
   keccak256(abi.encode(answer, salt, msg.sender, bountyId))
   ```

3. `submitCommitment(bountyId, commitment)` sends only that hash before the submission deadline. The browser retains the answer and salt; clearing its storage before reveal makes recovery impossible.
4. Between the two deadlines, `revealAnswer(bountyId, answer, salt)` verifies the hash and adds only valid reveals to the eligible submission array.
5. After the reveal deadline, the owner calls `judgeAll(bountyId, llmInput)` once. All valid revealed answers are sent in one LLM request.
6. The model response is advisory. The owner calls `finalizeWinner(bountyId, winnerIndex)`, and the contract pays that revealed submitter exactly once.

## Security Properties

- Commitments are bound to the answer, salt, submitter address, and bounty ID.
- Each address can commit and reveal at most once per bounty.
- Zero commitments, invalid phases, wrong answers/salts, foreign reveals, empty answers, oversized answers, and replay across bounties are rejected.
- A maximum of ten commitments bounds storage and batch size.
- Judging is owner-only, starts only after reveal closes, and requires a valid reveal.
- Winner indices are validated before state changes; reward state is cleared before the external payment.
- No private key, answer, or salt is logged or committed to Git.

## Install and Verify

Node.js 22 or newer and Corepack are recommended. PowerShell commands use pnpm 10 explicitly for reproducibility.

```powershell
Set-Location hardhat
$env:CI='true'
corepack pnpm@10.28.2 install --frozen-lockfile
corepack pnpm@10.28.2 exec hardhat test
corepack pnpm@10.28.2 exec hardhat compile --build-profile production

Set-Location ..\web
corepack pnpm@10.28.2 install --frozen-lockfile
corepack pnpm@10.28.2 test
corepack pnpm@10.28.2 exec tsc --noEmit
corepack pnpm@10.28.2 lint
corepack pnpm@10.28.2 build
```

## Reveal Test Plan

| Case | Expected result |
|---|---|
| Correct answer, salt, sender, and bounty during reveal window | Reveal succeeds and becomes eligible |
| Reveal before submission deadline | Revert: reveal not started |
| Reveal at or after reveal deadline | Revert: reveal closed |
| Address without a commitment reveals | Revert: no commitment |
| Original commitment revealed by another address | Revert: no commitment |
| Wrong answer or salt | Revert: commitment mismatch |
| Commitment reused for another bounty | Revert: commitment mismatch |
| Same participant reveals twice | Revert: already revealed |
| Empty or over-2,000-byte answer | Revert with length validation |
| Owner judges before reveal closes or with no valid reveals | Revert |
| Owner finalizes an out-of-range index or finalizes twice | Revert |

Automated coverage is in `hardhat/test/AIJudge.ts` and the frontend `*.test.ts` files.

## Ritual Deployment

The network configuration uses Ritual Chain ID `1979` and `https://rpc.ritualfoundation.org`. Never paste a seed phrase into the project. Store the deployer private key in Hardhat's encrypted keystore:

```powershell
Set-Location hardhat
corepack pnpm@10.28.2 exec hardhat keystore set DEPLOYER_PRIVATE_KEY
corepack pnpm@10.28.2 exec hardhat ignition deploy ignition/modules/AIJudge.ts --network ritual --deployment-id privacy-preserving-ai-judge
```

The deployer needs RITUAL for deployment gas. Copy `web/.env.example` to `web/.env.local`, insert the deployed contract address, and verify that the configured LLM executor is still valid in `TEEServiceRegistry`. Before calling `judgeAll`, the connected owner also needs sufficient prepaid/locked funds in `RitualWallet`; the UI exposes that status.

## Assignment Reflection

The bounty title, rubric, deadlines, commitment hashes, wallet addresses, revealed answers, AI review, final winner, and payment should be public because they make the process auditable. The plaintext answer and random salt should remain hidden in the participant's browser until the reveal phase ends the copying advantage. In the required commit-reveal design, revealed answers become public on-chain, so this is timing privacy rather than permanent confidentiality. The AI should compare all valid reveals against the published rubric and return a consistent ranking with reasons. A human bounty owner should decide the final winner because rubric interpretation, abuse handling, and payment responsibility require accountable judgment. The contract should enforce objective rules such as deadlines, hash validity, eligibility, authorization, and one-time payment rather than delegating those rules to either the AI or a human.

## Submission Form

After deployment, submit:

- GitHub fork: `https://github.com/kamaledeng/ritual-chain-workshop`
- Deployed contract address: the `AIJudge` address printed by Ignition
- Deployment transaction hash: the successful creation transaction shown in the Ignition journal or Ritual explorer
- Struggle note: “The most challenging step was aligning the browser-generated ABI-encoded commitment with Solidity while enforcing separate submission and reveal deadlines. I addressed it with deterministic cross-layer hash tests and boundary-case contract tests.”
