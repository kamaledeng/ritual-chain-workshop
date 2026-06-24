import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeAbiParameters, parseAbiParameters } from "viem";

import { decodeAiReview } from "./aiReview";

describe("Ritual AI review decoding", () => {
  it("extracts JSON content from Ritual ABI-encoded CompletionData", () => {
    const content = JSON.stringify({
      winnerIndex: 1,
      ranking: [{ index: 1, score: 95, reason: "Best fit" }],
      summary: "Submission 1 wins.",
    });
    const messageData = encodeAbiParameters(
      parseAbiParameters("string, string, string, uint256, bytes[]"),
      ["assistant", content, "", 0n, []],
    );
    const choiceData = encodeAbiParameters(
      parseAbiParameters("uint256, string, bytes"),
      [0n, "stop", messageData],
    );
    const usageData = encodeAbiParameters(
      parseAbiParameters("uint256, uint256, uint256"),
      [100n, 50n, 150n],
    );
    const completionData = encodeAbiParameters(
      parseAbiParameters(
        "string, string, uint256, string, string, string, uint256, bytes[], bytes",
      ),
      ["id", "chat.completion", 1n, "zai-org/GLM-4.7-FP8", "", "default", 1n, [choiceData], usageData],
    );

    const decoded = decodeAiReview(completionData);
    assert.equal(decoded?.raw, content);
    assert.equal(decoded?.parsed?.winnerIndex, 1);
    assert.equal(decoded?.parsed?.ranking[0]?.score, 95);
  });

  it("still accepts plain UTF-8 JSON used by local harnesses", () => {
    const plain = "0x7b2277696e6e6572496e646578223a307d";
    assert.equal(decodeAiReview(plain)?.parsed?.winnerIndex, 0);
  });
});
