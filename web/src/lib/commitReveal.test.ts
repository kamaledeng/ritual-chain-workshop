import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  type Address,
} from "viem";

import {
  commitmentStorageKey,
  createCommitmentDraft,
  createCommitmentHash,
  loadCommitmentDraft,
  removeCommitmentDraft,
  saveCommitmentDraft,
  type StorageLike,
} from "./commitReveal";
import { getBountyStatus, canCommit, canReveal, type Bounty } from "./bounty";

const sender = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const contract = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
const salt = `0x${"11".repeat(32)}` as const;

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("commit reveal browser utilities", () => {
  it("matches Solidity abi.encode commitment hashing", () => {
    const answer = "private answer";
    const bountyId = 7n;
    const expected = keccak256(
      encodeAbiParameters(
        parseAbiParameters("string, bytes32, address, uint256"),
        [answer, salt, sender, bountyId],
      ),
    );
    assert.equal(createCommitmentHash({ answer, salt, sender, bountyId }), expected);
    assert.notEqual(
      createCommitmentHash({ answer, salt, sender, bountyId: 8n }),
      expected,
    );
  });

  it("namespaces and round-trips a private draft", () => {
    const storage = new MemoryStorage();
    const key = commitmentStorageKey({
      chainId: 1979,
      contractAddress: contract,
      bountyId: 7n,
      account: sender,
    });
    const draft = createCommitmentDraft({
      answer: "private answer",
      sender,
      bountyId: 7n,
      salt,
      createdAt: 123,
    });
    assert.match(key, /1979.*5fbdb231.*7.*70997970/i);
    saveCommitmentDraft(storage, key, draft);
    assert.deepEqual(loadCommitmentDraft(storage, key), draft);
    removeCommitmentDraft(storage, key);
    assert.equal(loadCommitmentDraft(storage, key), null);
  });

  it("rejects malformed stored draft data", () => {
    const storage = new MemoryStorage();
    storage.setItem("bad", "not json");
    assert.equal(loadCommitmentDraft(storage, "bad"), null);
    storage.setItem("bad", JSON.stringify({ version: 1, answer: "x" }));
    assert.equal(loadCommitmentDraft(storage, "bad"), null);
  });
});

describe("bounty phases", () => {
  const bounty: Bounty = {
    owner: sender,
    title: "Title",
    rubric: "Rubric",
    reward: 1n,
    submissionDeadline: 100n,
    revealDeadline: 200n,
    judged: false,
    finalized: false,
    commitmentCount: 1n,
    submissionCount: 0n,
    winnerIndex: 0n,
    aiReview: "0x",
  };

  it("derives every phase at exact boundaries", () => {
    assert.equal(getBountyStatus(bounty, 99), "submission");
    assert.equal(getBountyStatus(bounty, 100), "reveal");
    assert.equal(getBountyStatus(bounty, 199), "reveal");
    assert.equal(getBountyStatus(bounty, 200), "ready");
    assert.equal(canCommit(bounty, 99), true);
    assert.equal(canCommit(bounty, 100), false);
    assert.equal(canReveal(bounty, 100), true);
    assert.equal(canReveal(bounty, 200), false);
    assert.equal(getBountyStatus({ ...bounty, judged: true }, 1), "judged");
    assert.equal(
      getBountyStatus({ ...bounty, judged: true, finalized: true }, 1),
      "finalized",
    );
  });
});
