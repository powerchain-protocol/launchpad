import crypto from "node:crypto";
import type { Transaction } from "@solana/web3.js";
import { addIntent } from "@/lib/server/store";
import { sha256Bytes } from "@/lib/server/hash";
import type { TransactionIntent, TransactionRecord } from "@/types/domain";

export async function persistIntent(args: {
  tx: Transaction;
  kind: TransactionRecord["kind"];
  payer: string;
  recipient: string;
  mint?: string;
  amount: string;
  serviceFee: string;
  quoteId?: string;
  quoteHash?: string;
  saleId?: string;
  tokenAmount?: string;
  ttlMs?: number;
}) {
  const now = new Date();
  const intent: TransactionIntent = {
    id: crypto.randomUUID(),
    kind: args.kind,
    payer: args.payer,
    recipient: args.recipient,
    mint: args.mint,
    amount: args.amount,
    serviceFee: args.serviceFee,
    quoteId: args.quoteId,
    quoteHash: args.quoteHash,
    saleId: args.saleId,
    tokenAmount: args.tokenAmount,
    messageHash: sha256Bytes(args.tx.serializeMessage()),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + (args.ttlMs || 120_000)).toISOString(),
  };
  return addIntent(intent);
}
