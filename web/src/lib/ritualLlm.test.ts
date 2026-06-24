import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeAbiParameters, parseAbiParameters } from "viem";

import { buildJudgeAllLlmInput } from "./ritualLlm";

describe("Ritual LLM batch request", () => {
  it("encodes the canonical 30-field GLM request", () => {
    const executor = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
    const encoded = buildJudgeAllLlmInput({
      executorAddress: executor,
      title: "Title",
      rubric: "Correctness",
      submissions: [{ index: 0, submitter: executor, answer: "Answer" }],
    });
    const decoded = decodeAbiParameters(
      parseAbiParameters(
        "address, bytes[], uint256, bytes[], bytes, string, string, int256, string, bool, int256, string, string, uint256, bool, int256, string, bytes, int256, string, string, bool, int256, bytes, bytes, int256, int256, string, bool, (string,string,string)",
      ),
      encoded,
    );

    assert.equal(decoded.length, 30);
    assert.equal(decoded[0].toLowerCase(), executor.toLowerCase());
    assert.equal(decoded[2], 300n);
    assert.match(decoded[5], /Answer/);
    assert.equal(decoded[6], "zai-org/GLM-4.7-FP8");
    assert.equal(decoded[10], 8192n);
    assert.equal(decoded[14], true);
    assert.equal(decoded[19], "auto");
    assert.deepEqual(decoded[29], ["", "", ""]);
  });
});
