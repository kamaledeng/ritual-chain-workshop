"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { parseEther, parseEventLogs } from "viem";
import { contractAddress, isContractConfigured } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import aiJudgeAbi from "@/abi/AIJudge";
import { useWriteTx } from "@/hooks/useWriteTx";
import {
  Card, CardHeader, CardBody, Field, Input, Textarea, Button, TxStatus, Notice,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

function defaultDate(hoursAhead: number): string {
  const d = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateBountyForm({ onCreated }: { onCreated?: (bountyId: bigint) => void }) {
  const { isConnected } = useAccount();
  const [title, setTitle] = useState("");
  const [rubric, setRubric] = useState("");
  const [submissionDeadline, setSubmissionDeadline] = useState(defaultDate(1));
  const [revealDeadline, setRevealDeadline] = useState(defaultDate(2));
  const [reward, setReward] = useState("");
  const [createdId, setCreatedId] = useState<bigint | null>(null);

  const tx = useWriteTx((receipt) => {
    try {
      const logs = parseEventLogs({ abi: aiJudgeAbi, eventName: "BountyCreated", logs: receipt.logs });
      const id = logs[0]?.args?.bountyId;
      if (id !== undefined) {
        setCreatedId(id);
        onCreated?.(id);
      }
    } catch {
      // A confirmed create remains valid even if an RPC omits decodable logs.
    }
  });

  const validation = useMemo(() => {
    if (!title.trim()) return "Title is required.";
    if (!rubric.trim()) return "Rubric is required.";
    const submissionMs = new Date(submissionDeadline).getTime();
    const revealMs = new Date(revealDeadline).getTime();
    if (!Number.isFinite(submissionMs)) return "Pick a valid submission deadline.";
    if (!Number.isFinite(revealMs)) return "Pick a valid reveal deadline.";
    if (revealMs <= submissionMs) return "Reveal deadline must follow submission deadline.";
    if (reward.trim() === "") return "Reward is required.";
    try {
      if (parseEther(reward) <= 0n) return "Reward must be greater than zero.";
    } catch {
      return "Reward must be a valid number.";
    }
    return null;
  }, [title, rubric, submissionDeadline, revealDeadline, reward]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validation || !contractAddress) return;
    const submissionMs = new Date(submissionDeadline).getTime();
    const revealMs = new Date(revealDeadline).getTime();
    if (submissionMs <= Date.now()) {
      window.alert("Submission deadline must be in the future.");
      return;
    }
    setCreatedId(null);
    try {
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "createBounty",
        args: [
          title.trim(),
          rubric.trim(),
          BigInt(Math.floor(submissionMs / 1000)),
          BigInt(Math.floor(revealMs / 1000)),
        ],
        value: parseEther(reward.trim()),
        chainId: ritualChain.id,
      });
    } catch {
      // Error is surfaced by TxStatus.
    }
  }

  return (
    <Card>
      <CardHeader title="Create a private bounty" subtitle="Set separate commit and reveal windows." />
      <CardBody>
        {!isContractConfigured && (
          <Notice tone="amber">Set <code className="font-mono">NEXT_PUBLIC_CONTRACT_ADDRESS</code> in <code className="font-mono">.env.local</code>.</Notice>
        )}
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></Field>
          <Field label="Rubric" hint="The AI ranks valid reveals against this rubric.">
            <Textarea value={rubric} onChange={(e) => setRubric(e.target.value)} rows={4} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Submission deadline"><Input type="datetime-local" value={submissionDeadline} onChange={(e) => setSubmissionDeadline(e.target.value)} /></Field>
            <Field label="Reveal deadline"><Input type="datetime-local" value={revealDeadline} onChange={(e) => setRevealDeadline(e.target.value)} /></Field>
          </div>
          <Field label="Reward (RITUAL)" hint="Locked until the owner finalizes a winner.">
            <Input type="number" min="0" step="any" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="1.0" />
          </Field>
          {validation && (title || rubric || reward) ? <p className="text-xs text-amber-300">{validation}</p> : null}
          <Button type="submit" disabled={!isConnected || !isContractConfigured || !!validation || tx.isBusy} className="w-full">
            {tx.isBusy ? "Creating…" : "Create bounty"}
          </Button>
          {!isConnected && <p className="text-xs text-zinc-500">Connect your wallet to create a bounty.</p>}
          <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
          {createdId !== null && <Notice tone="green">Bounty <span className="font-mono font-semibold">#{createdId.toString()}</span> created.</Notice>}
        </form>
      </CardBody>
    </Card>
  );
}
