import { canonicalize } from "../launch/canonical";
import type { CheckoutTransactionIntent, ParsedTransactionEffects } from "./types";

const HEX_SHA256 = /^[a-f0-9]{64}$/i;
const ATOMIC = /^\d+$/;

export function canonicalCheckoutIntentPayload(intent: Omit<CheckoutTransactionIntent, "intentHash">): string {
  return canonicalize({
    version: intent.version,
    orderId: intent.orderId,
    quoteId: intent.quoteId,
    quoteHash: intent.quoteHash,
    chain: intent.chain,
    network: intent.network,
    wallet: intent.wallet,
    transfers: intent.transfers,
    serviceFeeAtomic: intent.serviceFeeAtomic,
    issuedAt: intent.issuedAt,
    expiresAt: intent.expiresAt,
  });
}

export function validateCheckoutIntent(intent: CheckoutTransactionIntent, now = new Date()): void {
  if (intent.version !== 1) throw new Error("Unsupported checkout intent version.");
  for (const [name, value] of Object.entries({
    orderId: intent.orderId, quoteId: intent.quoteId, quoteHash: intent.quoteHash,
    wallet: intent.wallet, intentHash: intent.intentHash,
  })) {
    if (!value.trim()) throw new Error(`${name} is required.`);
  }
  if (!HEX_SHA256.test(intent.quoteHash) || !HEX_SHA256.test(intent.intentHash)) {
    throw new Error("Checkout intent hashes must be SHA-256 hex digests.");
  }
  if (!ATOMIC.test(intent.serviceFeeAtomic)) throw new Error("serviceFeeAtomic must be an unsigned atomic amount.");
  if (!intent.transfers.length) throw new Error("Checkout intent requires at least one transfer.");
  for (const transfer of intent.transfers) {
    if (!transfer.recipient.trim() || !transfer.asset.trim()) throw new Error("Checkout transfer recipient and asset are required.");
    if (!ATOMIC.test(transfer.amountAtomic) || BigInt(transfer.amountAtomic) <= 0n) {
      throw new Error("Checkout transfer amount must be positive.");
    }
  }
  const issued = Date.parse(intent.issuedAt);
  const expires = Date.parse(intent.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued) {
    throw new Error("Checkout intent timestamps are invalid.");
  }
  if (expires <= now.getTime()) throw new Error("Checkout transaction intent has expired.");
}

function transferKey(transfer: { recipient: string; asset: string; amountAtomic: string }): string {
  return `${transfer.recipient}|${transfer.asset}|${transfer.amountAtomic}`;
}

export function assertParsedTransactionMatchesIntent(
  intent: CheckoutTransactionIntent,
  effects: ParsedTransactionEffects,
  now = new Date(),
): void {
  validateCheckoutIntent(intent, now);
  if (effects.chain !== intent.chain) throw new Error("Submitted transaction chain does not match intent.");
  if (effects.network !== intent.network) throw new Error("Submitted transaction network does not match intent.");
  if (effects.wallet !== intent.wallet) throw new Error("Submitted transaction signer does not match intent wallet.");
  if (effects.quoteHash && effects.quoteHash.toLowerCase() !== intent.quoteHash.toLowerCase()) {
    throw new Error("Submitted transaction quote commitment does not match reviewed quote.");
  }

  const expected = intent.transfers.map(transferKey).sort();
  const actual = effects.transfers.map(transferKey).sort();
  if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) {
    throw new Error("Submitted transaction transfers do not match the server-authoritative checkout intent.");
  }
}
