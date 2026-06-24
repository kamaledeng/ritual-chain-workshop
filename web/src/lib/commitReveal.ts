import {
  bytesToHex,
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type CommitmentDraft = {
  version: 1;
  answer: string;
  salt: Hex;
  commitment: Hex;
  createdAt: number;
};

type CommitmentInput = {
  answer: string;
  salt: Hex;
  sender: Address;
  bountyId: bigint;
};

export function createCommitmentHash(input: CommitmentInput): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("string, bytes32, address, uint256"),
      [input.answer, input.salt, input.sender, input.bountyId],
    ),
  );
}

export function createCommitmentDraft({
  answer,
  sender,
  bountyId,
  salt,
  createdAt = Date.now(),
}: Omit<CommitmentInput, "salt"> & { salt?: Hex; createdAt?: number }): CommitmentDraft {
  const generatedSalt = salt ?? bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  return {
    version: 1,
    answer,
    salt: generatedSalt,
    commitment: createCommitmentHash({
      answer,
      salt: generatedSalt,
      sender,
      bountyId,
    }),
    createdAt,
  };
}

export function commitmentStorageKey({
  chainId,
  contractAddress,
  bountyId,
  account,
}: {
  chainId: number;
  contractAddress: Address;
  bountyId: bigint;
  account: Address;
}): string {
  return [
    "ritual-ai-judge",
    "commitment-v1",
    chainId,
    contractAddress.toLowerCase(),
    bountyId.toString(),
    account.toLowerCase(),
  ].join(":");
}

function isHex32(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isDraft(value: unknown): value is CommitmentDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<CommitmentDraft>;
  return (
    draft.version === 1 &&
    typeof draft.answer === "string" &&
    draft.answer.length > 0 &&
    isHex32(draft.salt) &&
    isHex32(draft.commitment) &&
    typeof draft.createdAt === "number" &&
    Number.isFinite(draft.createdAt)
  );
}

export function saveCommitmentDraft(
  storage: StorageLike,
  key: string,
  draft: CommitmentDraft,
): void {
  storage.setItem(key, JSON.stringify(draft));
}

export function loadCommitmentDraft(
  storage: StorageLike,
  key: string,
): CommitmentDraft | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function removeCommitmentDraft(storage: StorageLike, key: string): void {
  storage.removeItem(key);
}
