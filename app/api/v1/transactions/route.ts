import crypto from "node:crypto";
import { Connection } from "@solana/web3.js";
import { config } from "@/lib/config";
import {
  addTx,
  consumeIntent,
  finalizeValidatedIntentPurchase,
  finalizeValidatedQuote,
  getIntent,
  getTxByIntent,
  listTx,
  updateTx,
} from "@/lib/server/store";
import { sha256Bytes } from "@/lib/server/hash";
import type { TransactionIntent, TransactionRecord } from "@/types/domain";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function verifyIntentTransaction(intentId: string, signature: string): Promise<{ intent: TransactionIntent; networkFeeLamports: number } | null> {
  const intent = await getIntent(intentId);
  if (!intent) throw new Error("INTENT_NOT_FOUND");
  if (intent.consumedAt && intent.signature !== signature) throw new Error("INTENT_ALREADY_CONSUMED");
  if (Date.now() > Date.parse(intent.expiresAt) && !intent.consumedAt) throw new Error("INTENT_EXPIRED");
  const connection = new Connection(config.rpcUrl, "confirmed");
  for (let i = 0; i < 8; i += 1) {
    const chain = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }).catch(() => null);
    if (chain) {
      if (chain.meta?.err) throw new Error("TRANSACTION_FAILED_ON_CHAIN");
      const chainSignature = String(chain.transaction.signatures[0]);
      if (chainSignature !== signature) throw new Error("SIGNATURE_MISMATCH");
      const messageBytes = chain.transaction.message.serialize();
      if (sha256Bytes(messageBytes) !== intent.messageHash) throw new Error("TRANSACTION_INTENT_MISMATCH");
      return { intent, networkFeeLamports: chain.meta?.fee || 0 };
    }
    await sleep(500);
  }
  return null;
}

export async function GET() {
  return Response.json({ transactions: await listTx() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const intentId = String(body.intentId || "");
    const signature = String(body.signature || "");
    if (!intentId || !signature) return Response.json({ error: "MISSING_INTENT_OR_SIGNATURE" }, { status: 400 });

    const existing = await getTxByIntent(intentId);
    if (existing?.status === "VALIDATED") return Response.json({ transaction: existing, replayed: true });

    const verified = await verifyIntentTransaction(intentId, signature);
    if (!verified) {
      if (existing) return Response.json({ transaction: existing, pending: true }, { status: 202 });
      const base = await getIntent(intentId);
      if (!base) throw new Error("INTENT_NOT_FOUND");
      const pending: TransactionRecord = {
        id: crypto.randomUUID(),
        intentId,
        kind: base.kind,
        payer: base.payer,
        recipient: base.recipient,
        mint: base.mint,
        amount: base.amount,
        serviceFee: base.serviceFee,
        quoteId: base.quoteId,
        quoteHash: base.quoteHash,
        signature,
        status: "SUBMITTED",
        createdAt: new Date().toISOString(),
      };
      await addTx(pending);
      return Response.json({ transaction: pending, pending: true }, { status: 202 });
    }

    const { intent, networkFeeLamports } = verified;
    const consumed = intent.consumedAt ? intent : await consumeIntent(intentId, signature);
    if (!consumed) {
      const fresh = await getIntent(intentId);
      if (!fresh?.consumedAt || fresh.signature !== signature) throw new Error("INTENT_CONSUME_CONFLICT");
    }

    let tx = existing;
    if (!tx) {
      tx = {
        id: crypto.randomUUID(),
        intentId,
        kind: intent.kind,
        payer: intent.payer,
        recipient: intent.recipient,
        mint: intent.mint,
        amount: intent.amount,
        serviceFee: intent.serviceFee,
        quoteId: intent.quoteId,
        quoteHash: intent.quoteHash,
        signature,
        networkFeeLamports,
        status: "VALIDATED",
        createdAt: new Date().toISOString(),
        validatedAt: new Date().toISOString(),
      };
      await addTx(tx);
    } else {
      tx = await updateTx(tx.id, { signature, networkFeeLamports, status: "VALIDATED", validatedAt: new Date().toISOString() });
      if (!tx) throw new Error("TRANSACTION_UPDATE_FAILED");
    }

    if (intent.quoteId) tx = await finalizeValidatedQuote({ quoteId: intent.quoteId, tx });
    else if (intent.kind === "TOKEN_PURCHASE") await finalizeValidatedIntentPurchase(intentId, tx.id);

    return Response.json({ transaction: tx }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "TRANSACTION_VALIDATION_FAILED" }, { status: 400 });
  }
}
