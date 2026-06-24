"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAccount, useReadContract } from "wagmi";
import { zeroHash } from "viem";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { canCommit, canReveal, type Bounty } from "@/lib/bounty";
import {
  commitmentStorageKey,
  createCommitmentDraft,
  loadCommitmentDraft,
  removeCommitmentDraft,
  saveCommitmentDraft,
  type CommitmentDraft,
} from "@/lib/commitReveal";
import { useNow } from "@/hooks/useNow";
import { useWriteTx } from "@/hooks/useWriteTx";
import { Card, CardHeader, CardBody, Field, Textarea, Button, TxStatus, Notice } from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;
const draftChangedEvent = "ritual-commitment-draft-changed";

function subscribeToDrafts(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(draftChangedEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(draftChangedEvent, callback);
  };
}

export function SubmitAnswer({
  bountyId,
  bounty,
  onSubmitted,
}: {
  bountyId: bigint;
  bounty: Bounty;
  onSubmitted: () => void;
}) {
  const { address, isConnected } = useAccount();
  const now = useNow() / 1000;
  const [answer, setAnswer] = useState("");
  const actionRef = useRef<"commit" | "reveal" | null>(null);

  const storageKey = useMemo(() => {
    if (!address || !contractAddress) return null;
    return commitmentStorageKey({
      chainId: ritualChain.id,
      contractAddress,
      bountyId,
      account: address,
    });
  }, [address, bountyId]);

  const rawDraft = useSyncExternalStore(
    subscribeToDrafts,
    () => (storageKey ? window.localStorage.getItem(storageKey) : null),
    () => null,
  );
  const draft: CommitmentDraft | null = useMemo(() => {
    if (!storageKey || rawDraft === null) return null;
    return loadCommitmentDraft(window.localStorage, storageKey);
  }, [rawDraft, storageKey]);

  const commitmentQuery = useReadContract({
    address: contractAddress,
    abi: aiJudgeAbi,
    functionName: "getCommitment",
    args: address ? [bountyId, address] : undefined,
    chainId: ritualChain.id,
    query: { enabled: Boolean(contractAddress && address) },
  });
  const hasCommitment = Boolean(commitmentQuery.data && commitmentQuery.data[0] !== zeroHash);
  const hasRevealed = Boolean(commitmentQuery.data?.[1]);

  const onConfirmed = useCallback(() => {
    if (actionRef.current === "reveal" && storageKey) {
      removeCommitmentDraft(window.localStorage, storageKey);
      window.dispatchEvent(new Event(draftChangedEvent));
    }
    actionRef.current = null;
    void commitmentQuery.refetch();
    onSubmitted();
  }, [commitmentQuery, onSubmitted, storageKey]);
  const tx = useWriteTx(onConfirmed);

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault();
    if (!address || !contractAddress || !storageKey || !answer.trim()) return;
    const nextDraft = draft ?? createCommitmentDraft({
      answer: answer.trim(),
      sender: address,
      bountyId,
    });
    saveCommitmentDraft(window.localStorage, storageKey, nextDraft);
    window.dispatchEvent(new Event(draftChangedEvent));
    actionRef.current = "commit";
    try {
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "submitCommitment",
        args: [bountyId, nextDraft.commitment],
        chainId: ritualChain.id,
      });
    } catch {
      actionRef.current = null;
    }
  }

  async function handleReveal() {
    if (!contractAddress || !draft) return;
    actionRef.current = "reveal";
    try {
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "revealAnswer",
        args: [bountyId, draft.answer, draft.salt],
        chainId: ritualChain.id,
      });
    } catch {
      actionRef.current = null;
    }
  }

  if (bounty.judged || bounty.finalized) return null;

  if (canCommit(bounty, now)) {
    return (
      <Card>
        <CardHeader title="Commit a private answer" subtitle="Only a hash is sent on-chain during this phase." />
        <CardBody className="space-y-3">
          <Notice tone="amber">Your answer and random salt stay in this browser. Do not clear browser data before the reveal phase.</Notice>
          {hasCommitment ? (
            <Notice tone="green">Commitment confirmed. Return during the reveal phase with this browser and wallet.</Notice>
          ) : (
            <form onSubmit={handleCommit} className="space-y-3">
              <Field label="Your private answer">
                <Textarea value={draft?.answer ?? answer} onChange={(e) => setAnswer(e.target.value)} rows={5} disabled={Boolean(draft)} maxLength={2_000} />
              </Field>
              {draft && <p className="text-xs text-zinc-400">A saved draft is ready to retry with the same commitment.</p>}
              <Button type="submit" disabled={!isConnected || !(draft?.answer ?? answer.trim()) || tx.isBusy} className="w-full">
                {tx.isBusy ? "Committing…" : draft ? "Retry commitment" : "Commit answer hash"}
              </Button>
            </form>
          )}
          <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
        </CardBody>
      </Card>
    );
  }

  if (canReveal(bounty, now)) {
    return (
      <Card>
        <CardHeader title="Reveal your answer" subtitle="The contract verifies it against your earlier commitment." />
        <CardBody className="space-y-3">
          {hasRevealed ? (
            <Notice tone="green">Answer revealed and eligible for judging.</Notice>
          ) : !hasCommitment ? (
            <Notice tone="zinc">This wallet did not submit a commitment for this bounty.</Notice>
          ) : !draft ? (
            <Notice tone="red">No matching browser draft was found. The answer and salt are required to reveal.</Notice>
          ) : (
            <>
              <Notice tone="amber">Revealing makes the answer public and eligible for the batched AI review.</Notice>
              <div className="whitespace-pre-wrap break-words rounded-xl bg-black/20 p-3 text-sm text-zinc-200 ring-1 ring-inset ring-white/10">{draft.answer}</div>
              <Button onClick={handleReveal} disabled={tx.isBusy} className="w-full">{tx.isBusy ? "Revealing…" : "Reveal answer"}</Button>
            </>
          )}
          <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
        </CardBody>
      </Card>
    );
  }

  return null;
}
