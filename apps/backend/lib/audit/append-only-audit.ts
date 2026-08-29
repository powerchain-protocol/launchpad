import { createHash } from "node:crypto";
import { canonicalize } from "@powerchain/launchpad-domain/launch";

export interface AuditRecordInput {
  aggregateType: "launch" | "checkout" | "governance";
  aggregateId: string;
  action: string;
  actor: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  previousHash?: string;
}

export interface AuditRecord extends AuditRecordInput {
  hash: string;
}

export interface AppendOnlyAuditRepository {
  append(record: AuditRecord): Promise<void>;
  getLatestHash(aggregateType: AuditRecordInput["aggregateType"], aggregateId: string): Promise<string | null>;
}

export async function appendAuditRecord(
  repository: AppendOnlyAuditRepository,
  input: Omit<AuditRecordInput, "previousHash">,
): Promise<AuditRecord> {
  const previousHash = await repository.getLatestHash(input.aggregateType, input.aggregateId) ?? undefined;
  const payload = { ...input, previousHash: previousHash ?? null };
  const hash = createHash("sha256").update(canonicalize(payload)).digest("hex");
  const record = { ...input, previousHash, hash };
  await repository.append(record);
  return record;
}
