import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  stringToHex,
} from "viem";

const reward = 1_000_000_000_000_000_000n;
const salt = `0x${"11".repeat(32)}` as const;

describe("AIJudge commit reveal", async function () {
  const { viem, provider } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [owner, participant, stranger] = await viem.getWalletClients();

  async function now() {
    return (await publicClient.getBlock()).timestamp;
  }

  async function moveTo(timestamp: bigint) {
    await provider.request({
      method: "evm_setNextBlockTimestamp",
      params: [Number(timestamp)],
    });
    await provider.request({ method: "evm_mine" });
  }

  async function deployWithBounty() {
    const aiJudge = await viem.deployContract("AIJudge");
    const current = await now();
    const submissionDeadline = current + 100n;
    const revealDeadline = current + 200n;

    await aiJudge.write.createBounty(
      ["Private bounty", "Correctness first", submissionDeadline, revealDeadline],
      { account: owner.account, value: reward },
    );

    return { aiJudge, submissionDeadline, revealDeadline };
  }

  function commitmentFor(
    answer: string,
    sender: `0x${string}`,
    bountyId = 1n,
    answerSalt: `0x${string}` = salt,
  ) {
    return keccak256(
      encodeAbiParameters(
        parseAbiParameters("string, bytes32, address, uint256"),
        [answer, answerSalt, sender, bountyId],
      ),
    );
  }

  it("stores only a commitment before revealing a valid answer", async function () {
    const { aiJudge, submissionDeadline } = await deployWithBounty();
    const answer = "My private answer";
    const commitment = commitmentFor(answer, participant.account.address);

    await aiJudge.write.submitCommitment([1n, commitment], {
      account: participant.account,
    });

    const record = await aiJudge.read.getCommitment([
      1n,
      participant.account.address,
    ]);
    assert.equal(record[0], commitment);
    assert.equal(record[1], false);

    const bytecode = await publicClient.getCode({ address: aiJudge.address });
    assert.equal(bytecode?.includes(stringToHex(answer).slice(2)), false);

    await moveTo(submissionDeadline);
    await aiJudge.write.revealAnswer([1n, answer, salt], {
      account: participant.account,
    });

    const submission = await aiJudge.read.getSubmission([1n, 0n]);
    assert.equal(submission[0].toLowerCase(), participant.account.address.toLowerCase());
    assert.equal(submission[1], answer);
    assert.equal((await aiJudge.read.getCommitment([1n, participant.account.address]))[1], true);
  });

  it("rejects invalid deadlines and invalid commitment submissions", async function () {
    const aiJudge = await viem.deployContract("AIJudge");
    const current = await now();

    await assert.rejects(
      aiJudge.write.createBounty(
        ["Bad", "Bad", current, current + 1n],
        { account: owner.account, value: reward },
      ),
      /submission deadline must be future/,
    );
    await assert.rejects(
      aiJudge.write.createBounty(
        ["Bad", "Bad", current + 100n, current + 100n],
        { account: owner.account, value: reward },
      ),
      /reveal deadline must follow submission/,
    );

    const { aiJudge: valid, submissionDeadline } = await deployWithBounty();
    await assert.rejects(
      valid.write.submitCommitment([1n, `0x${"00".repeat(32)}`], {
        account: participant.account,
      }),
      /commitment required/,
    );

    const commitment = commitmentFor("answer", participant.account.address);
    await valid.write.submitCommitment([1n, commitment], {
      account: participant.account,
    });
    await assert.rejects(
      valid.write.submitCommitment([1n, commitment], {
        account: participant.account,
      }),
      /already committed/,
    );

    await moveTo(submissionDeadline);
    await assert.rejects(
      valid.write.submitCommitment([
        1n,
        commitmentFor("late", stranger.account.address),
      ], { account: stranger.account }),
      /submissions closed/,
    );
  });

  it("rejects invalid, duplicate, foreign, and late reveals", async function () {
    const { aiJudge, submissionDeadline, revealDeadline } = await deployWithBounty();
    const answer = "correct";
    const commitment = commitmentFor(answer, participant.account.address);
    await aiJudge.write.submitCommitment([1n, commitment], {
      account: participant.account,
    });

    await assert.rejects(
      aiJudge.write.revealAnswer([1n, answer, salt], {
        account: participant.account,
      }),
      /reveal not started/,
    );

    await moveTo(submissionDeadline);
    await assert.rejects(
      aiJudge.write.revealAnswer([1n, answer, salt], {
        account: stranger.account,
      }),
      /no commitment/,
    );
    await assert.rejects(
      aiJudge.write.revealAnswer([1n, "wrong", salt], {
        account: participant.account,
      }),
      /commitment mismatch/,
    );
    await assert.rejects(
      aiJudge.write.revealAnswer([1n, answer, `0x${"22".repeat(32)}`], {
        account: participant.account,
      }),
      /commitment mismatch/,
    );

    await aiJudge.write.revealAnswer([1n, answer, salt], {
      account: participant.account,
    });
    await assert.rejects(
      aiJudge.write.revealAnswer([1n, answer, salt], {
        account: participant.account,
      }),
      /already revealed/,
    );

    const second = commitmentFor("second", stranger.account.address);
    const secondBounty = await viem.deployContract("AIJudge");
    const current = await now();
    await secondBounty.write.createBounty(
      ["Second", "Rubric", current + 20n, current + 40n],
      { account: owner.account, value: reward },
    );
    await secondBounty.write.submitCommitment([1n, second], {
      account: stranger.account,
    });
    await moveTo(revealDeadline);
    await assert.rejects(
      secondBounty.write.revealAnswer([1n, "second", salt], {
        account: stranger.account,
      }),
      /reveal closed/,
    );
  });

  it("binds a commitment to its sender and bounty id", async function () {
    const { aiJudge, submissionDeadline } = await deployWithBounty();
    const current = await now();
    await aiJudge.write.createBounty(
      ["Second", "Rubric", current + 100n, current + 200n],
      { account: owner.account, value: reward },
    );

    const answer = "bound answer";
    await aiJudge.write.submitCommitment(
      [2n, commitmentFor(answer, participant.account.address, 1n)],
      { account: participant.account },
    );
    await moveTo(submissionDeadline);
    await assert.rejects(
      aiJudge.write.revealAnswer([2n, answer, salt], {
        account: participant.account,
      }),
      /commitment mismatch/,
    );
  });

  it("rejects empty and oversized revealed answers", async function () {
    const emptyCase = await deployWithBounty();
    await emptyCase.aiJudge.write.submitCommitment(
      [1n, commitmentFor("", participant.account.address)],
      { account: participant.account },
    );
    await moveTo(emptyCase.submissionDeadline);
    await assert.rejects(
      emptyCase.aiJudge.write.revealAnswer([1n, "", salt], {
        account: participant.account,
      }),
      /answer required/,
    );

    const longCase = await deployWithBounty();
    const oversized = "a".repeat(2_001);
    await longCase.aiJudge.write.submitCommitment(
      [1n, commitmentFor(oversized, participant.account.address)],
      { account: participant.account },
    );
    await moveTo(longCase.submissionDeadline);
    await assert.rejects(
      longCase.aiJudge.write.revealAnswer([1n, oversized, salt], {
        account: participant.account,
      }),
      /answer too long/,
    );
  });

  it("gates batch judging and pays the human-selected winner once", async function () {
    const aiJudge = await viem.deployContract("AIJudgeHarness");
    const current = await now();
    const submissionDeadline = current + 100n;
    const revealDeadline = current + 200n;
    const answer = "winning answer";
    await aiJudge.write.createBounty(
      ["Private bounty", "Correctness first", submissionDeadline, revealDeadline],
      { account: owner.account, value: reward },
    );
    await aiJudge.write.submitCommitment(
      [1n, commitmentFor(answer, participant.account.address)],
      { account: participant.account },
    );
    await moveTo(submissionDeadline);
    await aiJudge.write.revealAnswer([1n, answer, salt], {
      account: participant.account,
    });

    await assert.rejects(
      aiJudge.write.judgeAll([1n, "0x1234"], { account: owner.account }),
      /reveal still open/,
    );
    await moveTo(revealDeadline);
    await assert.rejects(
      aiJudge.write.judgeAll([1n, "0x1234"], { account: stranger.account }),
      /not bounty owner/,
    );

    await aiJudge.write.judgeAll([1n, "0x1234"], { account: owner.account });
    const bounty = await aiJudge.read.getBounty([1n]);
    assert.equal(bounty[6], true);
    assert.equal(bounty[9], "0x7b2277696e6e6572496e646578223a307d");
    await assert.rejects(
      aiJudge.write.judgeAll([1n, "0x1234"], { account: owner.account }),
      /already judged/,
    );
    await assert.rejects(
      aiJudge.write.finalizeWinner([1n, 1n], { account: owner.account }),
      /invalid winner index/,
    );

    const balanceBefore = await publicClient.getBalance({
      address: participant.account.address,
    });
    await aiJudge.write.finalizeWinner([1n, 0n], { account: owner.account });
    const balanceAfter = await publicClient.getBalance({
      address: participant.account.address,
    });
    assert.equal(balanceAfter - balanceBefore, reward);
    await assert.rejects(
      aiJudge.write.finalizeWinner([1n, 0n], { account: owner.account }),
      /already finalized/,
    );
  });
});
