import type { Address } from "viem";

export type Bounty = {
  owner: Address;
  title: string;
  rubric: string;
  reward: bigint;
  submissionDeadline: bigint;
  revealDeadline: bigint;
  judged: boolean;
  finalized: boolean;
  commitmentCount: bigint;
  submissionCount: bigint;
  winnerIndex: bigint;
  aiReview: `0x${string}`;
};

export function parseBounty(
  raw: readonly [
    Address,
    string,
    string,
    bigint,
    bigint,
    bigint,
    boolean,
    boolean,
    bigint,
    `0x${string}`,
  ],
  counts: readonly [bigint, bigint] = [0n, 0n],
): Bounty {
  return {
    owner: raw[0],
    title: raw[1],
    rubric: raw[2],
    reward: raw[3],
    submissionDeadline: raw[4],
    revealDeadline: raw[5],
    judged: raw[6],
    finalized: raw[7],
    commitmentCount: counts[0],
    submissionCount: counts[1],
    winnerIndex: raw[8],
    aiReview: raw[9],
  };
}

export type BountyStatus =
  | "submission"
  | "reveal"
  | "ready"
  | "judged"
  | "finalized";

export function getBountyStatus(
  bounty: Bounty,
  nowSeconds = Date.now() / 1000,
): BountyStatus {
  if (bounty.finalized) return "finalized";
  if (bounty.judged) return "judged";
  if (nowSeconds >= Number(bounty.revealDeadline)) return "ready";
  if (nowSeconds >= Number(bounty.submissionDeadline)) return "reveal";
  return "submission";
}

export const STATUS_META: Record<
  BountyStatus,
  { label: string; tone: "green" | "amber" | "indigo" | "zinc" }
> = {
  submission: { label: "Commit phase", tone: "green" },
  reveal: { label: "Reveal phase", tone: "amber" },
  ready: { label: "Ready for judging", tone: "amber" },
  judged: { label: "Judged", tone: "indigo" },
  finalized: { label: "Finalized", tone: "zinc" },
};

export function canCommit(bounty: Bounty, nowSeconds = Date.now() / 1000): boolean {
  return getBountyStatus(bounty, nowSeconds) === "submission";
}

export function canReveal(bounty: Bounty, nowSeconds = Date.now() / 1000): boolean {
  return getBountyStatus(bounty, nowSeconds) === "reveal";
}
