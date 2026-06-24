import { decodeAbiParameters, hexToString, parseAbiParameters, type Hex } from "viem";

export type RankingEntry = {
  index: number;
  score: number;
  reason: string;
};

export type JudgeResult = {
  winnerIndex: number;
  ranking: RankingEntry[];
  summary: string;
};

export type DecodedAiReview = {
  raw: string;
  parsed: JudgeResult | null;
};

const EMPTY_BYTES = new Set(["", "0x"]);

export function decodeAiReview(aiReviewHex?: string): DecodedAiReview | null {
  if (!aiReviewHex || EMPTY_BYTES.has(aiReviewHex)) return null;

  let raw = decodeRitualCompletion(aiReviewHex as Hex);
  if (raw === null) {
    try {
      raw = hexToString(aiReviewHex as Hex);
    } catch {
      raw = aiReviewHex;
    }
  }

  return { raw, parsed: tryParseJudgeResult(raw) };
}

/** Extract the assistant content from Ritual's ABI-encoded CompletionData. */
function decodeRitualCompletion(completionData: Hex): string | null {
  try {
    const completion = decodeAbiParameters(
      parseAbiParameters(
        "string, string, uint256, string, string, string, uint256, bytes[], bytes",
      ),
      completionData,
    );
    if (completion[6] === 0n || completion[7].length === 0) return null;
    const choice = decodeAbiParameters(
      parseAbiParameters("uint256, string, bytes"),
      completion[7][0],
    );
    const message = decodeAbiParameters(
      parseAbiParameters("string, string, string, uint256, bytes[]"),
      choice[2],
    );
    return message[1];
  } catch {
    return null;
  }
}

function tryParseJudgeResult(text: string): JudgeResult | null {
  const candidate = extractJson(text);
  if (!candidate) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const value = obj as Record<string, unknown>;
  if (typeof value.winnerIndex !== "number") return null;

  const ranking: RankingEntry[] = Array.isArray(value.ranking)
    ? (value.ranking as unknown[])
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const item = entry as Record<string, unknown>;
          return {
            index: typeof item.index === "number" ? item.index : Number(item.index),
            score: typeof item.score === "number" ? item.score : Number(item.score),
            reason: typeof item.reason === "string" ? item.reason : String(item.reason ?? ""),
          } satisfies RankingEntry;
        })
        .filter((entry): entry is RankingEntry => entry !== null)
    : [];

  return {
    winnerIndex: value.winnerIndex,
    ranking,
    summary: typeof value.summary === "string" ? value.summary : "",
  };
}

function extractJson(text: string): string | null {
  let candidate = text.trim();
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidate = fence[1].trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start === -1 || end <= start ? null : candidate.slice(start, end + 1);
}
