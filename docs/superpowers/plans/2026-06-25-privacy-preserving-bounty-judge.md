# Privacy-Preserving AI Bounty Judge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship, verify, push, and deploy a full-stack commit-reveal bounty judge compatible with the workshop assignment.

**Architecture:** The Solidity contract owns phase enforcement and commitment verification; the browser owns the unrevealed answer and random salt. Valid reveals feed the existing single batched Ritual LLM call, and the owner retains final winner authority.

**Tech Stack:** Solidity 0.8.24, Hardhat 3, node:test, viem, Next.js 16, React 19, TypeScript, Ritual Chain 1979.

## Global Constraints

- Commitment formula is `keccak256(abi.encode(answer, salt, msg.sender, bountyId))`.
- Only valid revealed answers are eligible for judging and payment.
- One LLM batch call judges all revealed answers.
- AI output is advisory; the bounty owner selects the winner.
- No private keys, salts, or plaintext drafts may be committed or logged.

---

### Task 1: Contract commit-reveal state machine

**Files:**
- Create: `hardhat/test/AIJudge.ts`
- Modify: `hardhat/contracts/AIJudge.sol`

**Interfaces:**
- Produces: `createBounty(string,string,uint256,uint256)`, `submitCommitment(uint256,bytes32)`, `revealAnswer(uint256,string,bytes32)`, `judgeAll(uint256,bytes)`, and `finalizeWinner(uint256,uint256)`.
- Produces: `getCommitment(uint256,address)`, a `getBounty` tuple containing both deadlines, and `getBountyCounts(uint256)` for commitment/reveal counts. Counts are split out to keep Solidity 0.8.24 below its stack limit without requiring `viaIR`.

- [ ] **Step 1: Write failing lifecycle tests**

Create node:test cases that deploy `AIJudge`, create a bounty with `submissionDeadline` and `revealDeadline`, compute commitments with viem's `encodeAbiParameters` and `keccak256`, and assert: valid commit/reveal succeeds; plaintext is absent before reveal; zero/duplicate commitments fail; early, late, duplicate, foreign-sender, wrong-answer, wrong-salt, empty, and oversized reveals fail; replay across bounties fails; invalid deadlines fail.

```ts
const encoded = encodeAbiParameters(
  parseAbiParameters("string answer, bytes32 salt, address sender, uint256 bountyId"),
  [answer, salt, participant.account.address, bountyId],
);
const commitment = keccak256(encoded);
await aiJudge.write.submitCommitment([bountyId, commitment], { account: participant.account });
```

- [ ] **Step 2: Run the lifecycle tests and verify RED**

Run: `cd hardhat && npm test -- --grep "commit reveal"`

Expected: compilation or assertion failure because the required functions and two-deadline state do not exist.

- [ ] **Step 3: Implement the minimal state machine**

Replace plaintext submission with a per-bounty/per-address commitment record and enforce explicit phases.

```solidity
struct CommitmentRecord {
    bytes32 commitment;
    bool revealed;
}

mapping(uint256 => mapping(address => CommitmentRecord)) private commitments;

function computeCommitment(
    string calldata answer,
    bytes32 salt,
    address submitter,
    uint256 bountyId
) public pure returns (bytes32) {
    return keccak256(abi.encode(answer, salt, submitter, bountyId));
}
```

Keep a bounded `commitmentCount`, append to `submissions` only after a valid reveal, emit separate `CommitmentSubmitted` and `AnswerRevealed` events, and validate both creation deadlines.

- [ ] **Step 4: Add failing judging/finalization tests, then implement gates**

Assert owner-only access, reveal-deadline enforcement, no-empty-batch behavior, winner index bounds, one-time finalization, and exact reward payment. Run tests before implementation to confirm expected failures. Then require `block.timestamp >= revealDeadline`, validate `winnerIndex < submissions.length` before setting `finalized`, zero the reward before transfer, and retain the owner-only modifiers.

- [ ] **Step 5: Verify Task 1 GREEN**

Run: `cd hardhat && npm test`

Expected: all contract tests pass.

- [ ] **Step 6: Commit Task 1**

```powershell
git add hardhat/contracts/AIJudge.sol hardhat/test/AIJudge.ts
git commit -m "feat: secure bounty submissions with commit reveal"
```

### Task 2: Browser commitment storage and phase model

**Files:**
- Create: `web/src/lib/commitReveal.ts`
- Create: `web/src/lib/commitReveal.test.ts`
- Modify: `web/src/lib/bounty.ts`
- Modify: `web/package.json`

**Interfaces:**
- Produces: `createCommitmentDraft`, `saveCommitmentDraft`, `loadCommitmentDraft`, `removeCommitmentDraft`, `commitmentStorageKey`.
- Produces: phases `submission`, `reveal`, `ready`, `judged`, and `finalized` plus `canCommit` and `canReveal`.

- [ ] **Step 1: Add a frontend unit-test runner and failing pure-function tests**

Add `"test": "tsx --test src/**/*.test.ts"` and `tsx` as a dev dependency. Tests must verify deterministic ABI-compatible hashing, distinct hashes for sender/bounty/salt changes, local-storage key namespacing, JSON round trips, malformed data rejection, and every timestamp boundary.

```ts
assert.equal(
  createCommitmentHash({ answer, salt, sender, bountyId }),
  keccak256(encodeAbiParameters(
    parseAbiParameters("string, bytes32, address, uint256"),
    [answer, salt, sender, bountyId],
  )),
);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd web && pnpm test`

Expected: failure because `commitReveal.ts` and the expanded bounty model do not exist.

- [ ] **Step 3: Implement minimal pure utilities**

Use `crypto.getRandomValues(new Uint8Array(32))`, viem ABI encoding, and a versioned stored shape containing `answer`, `salt`, `commitment`, and `createdAt`. Accept a `Storage` argument so tests use an in-memory implementation without browser mocks. Never log the stored object.

- [ ] **Step 4: Implement and test phase derivation**

Map time and terminal state in this precedence order: finalized, judged, ready (`now >= revealDeadline`), reveal (`now >= submissionDeadline`), submission. `canCommit` is true only in submission; `canReveal` only in reveal.

- [ ] **Step 5: Verify Task 2 GREEN and commit**

Run: `cd web && pnpm test && pnpm exec tsc --noEmit`

```powershell
git add web/package.json web/pnpm-lock.yaml web/src/lib/commitReveal.ts web/src/lib/commitReveal.test.ts web/src/lib/bounty.ts
git commit -m "feat: add client commit reveal utilities"
```

### Task 3: Full frontend workflow and ABI

**Files:**
- Modify: `web/src/abi/AIJudge.ts`
- Modify: `web/src/components/CreateBountyForm.tsx`
- Replace: `web/src/components/SubmitAnswer.tsx`
- Modify: `web/src/components/BountyDetail.tsx`
- Modify: `web/src/components/BountyView.tsx`
- Modify: `web/src/components/JudgeAll.tsx`
- Modify: `web/src/components/SubmissionsList.tsx`
- Modify: `web/src/app/page.tsx`
- Modify: `web/src/app/layout.tsx`

**Interfaces:**
- Consumes: contract ABI and Task 2 utilities.
- Produces: two-deadline bounty creation, private commit UI, reveal UI, phase badges, and revealed-only judging/listing.

- [ ] **Step 1: Regenerate or update ABI from the compiled contract**

Copy the `AIJudge` ABI from `hardhat/artifacts/contracts/AIJudge.sol/AIJudge.json`, preserving `as const`, then type-check to reveal every stale frontend call site.

- [ ] **Step 2: Update bounty creation and detail views**

Add submission and reveal datetime fields. Validate `now < submissionDeadline < revealDeadline`, call the four-argument `createBounty`, and show both timestamps plus commitment and reveal counts.

- [ ] **Step 3: Replace plaintext submission with commit and reveal actions**

In submission phase, create and save the draft before sending `submitCommitment`; retain it if the transaction fails. In reveal phase, load only the connected wallet's draft and call `revealAnswer`; remove it only in `useWriteTx`'s confirmed receipt callback. Explain that clearing browser data loses the ability to reveal.

- [ ] **Step 4: Update owner actions and public copy**

Judge only after `revealDeadline`, gather revealed submissions only, keep finalization human-controlled, and change all copy from a single deadline/plaintext submission model to commit-reveal language.

- [ ] **Step 5: Verify and commit Task 3**

Run: `cd web && pnpm test && pnpm lint && pnpm build`

```powershell
git add web/src
git commit -m "feat: add commit reveal bounty interface"
```

### Task 4: Documentation and deployability

**Files:**
- Modify: `README.md`
- Modify: `hardhat/README.md`
- Modify: `hardhat/hardhat.config.ts`
- Verify: `hardhat/ignition/modules/AIJudge.ts`
- Create: `.env.example`

**Interfaces:**
- Produces: reproducible install/test/deploy instructions and assignment deliverables.

- [ ] **Step 1: Document lifecycle, architecture, limitations, and test plan**

Include the exact commitment formula, browser-secret warning, public/private data boundary, every reveal test case, batched judging design, human finalization, commands for install/test/build/deploy, and a 5-8 sentence reflection answering the assignment question.

- [ ] **Step 2: Verify deployment configuration without exposing secrets**

Keep Ritual chain ID `1979`, RPC `https://rpc.ritualfoundation.org`, and `DEPLOYER_PRIVATE_KEY` as a config variable. Ensure `.gitignore` excludes `.env*` except `.env.example`, and document Hardhat keystore usage.

- [ ] **Step 3: Run the complete verification suite**

```powershell
Set-Location hardhat
npm ci
npm test
npx hardhat compile --build-profile production
Set-Location ..\web
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm build
```

Expected: every command exits 0 without warnings that indicate broken behavior.

- [ ] **Step 4: Commit documentation**

```powershell
git add README.md hardhat/README.md hardhat/hardhat.config.ts hardhat/ignition/modules/AIJudge.ts .env.example .gitignore
git commit -m "docs: add bounty lifecycle and deployment guide"
```

### Task 5: Push and Ritual deployment

**Files:**
- No source changes unless deployment verification exposes a defect.

**Interfaces:**
- Produces: GitHub branch, contract address, deployment transaction hash, and form-ready struggle note.

- [ ] **Step 1: Confirm clean tree and push reviewed commits**

Run: `git status --short && git log --oneline origin/main..HEAD`, then push the completed branch to `origin` after all verification passes.

- [ ] **Step 2: Check deployer readiness**

Read the configured deployer address without printing its private key, query its Ritual balance, and stop if the account lacks funds. Never fabricate deployment evidence.

- [ ] **Step 3: Deploy with Ignition**

Run: `cd hardhat && npx hardhat ignition deploy ignition/modules/AIJudge.ts --network ritual --deployment-id privacy-preserving-ai-judge`

Expected: a deployed `AIJudge` address and successful deployment transaction.

- [ ] **Step 4: Verify on-chain evidence and prepare form values**

Use the Ritual RPC/explorer to confirm bytecode at the address and receipt status `1`. Report the fork URL, contract address, transaction hash, and this honest struggle note: "The most challenging step was aligning the browser-generated ABI-encoded commitment with Solidity while enforcing separate submission and reveal deadlines. I addressed it with cross-layer deterministic hash tests and boundary-case contract tests."
