import { canonicalize } from "../launch/canonical";
import type { BoundCheckoutQuote, CheckoutQuoteCommitment } from "./types";

const HEX_SHA256 = /^[a-f0-9]{64}$/i;
const POSITIVE_ATOMIC = /^\d+$/;

export function canonicalCheckoutQuotePayload(quote: CheckoutQuoteCommitment): string {
  return canonicalize({
    version: quote.version,
    quoteId: quote.quoteId,
    chain: quote.chain,
    network: quote.network,
    wallet: quote.wallet,
    paymentAsset: quote.paymentAsset,
    paymentAmountAtomic: quote.paymentAmountAtomic,
    receiveMintOrType: quote.receiveMintOrType,
    receiveAmountAtomic: quote.receiveAmountAtomic,
    treasuryAddress: quote.treasuryAddress,
    serviceFeeAtomic: quote.serviceFeeAtomic,
    nonce: quote.nonce,
    issuedAt: quote.issuedAt,
    expiresAt: quote.expiresAt,
  });
}

export function validateCheckoutQuoteCommitment(quote: CheckoutQuoteCommitment): void {
  if (quote.version !== 1) throw new Error("Unsupported checkout quote version.");
  for (const [name, value] of Object.entries({
    quoteId: quote.quoteId,
    wallet: quote.wallet,
    receiveMintOrType: quote.receiveMintOrType,
    treasuryAddress: quote.treasuryAddress,
    nonce: quote.nonce,
  })) {
    if (!value.trim()) throw new Error(`${name} is required.`);
  }

  for (const [name, value] of Object.entries({
    paymentAmountAtomic: quote.paymentAmountAtomic,
    receiveAmountAtomic: quote.receiveAmountAtomic,
    serviceFeeAtomic: quote.serviceFeeAtomic,
  })) {
    if (!POSITIVE_ATOMIC.test(value)) throw new Error(`${name} must be an unsigned atomic amount.`);
  }
  if (BigInt(quote.paymentAmountAtomic) <= 0n) throw new Error("Payment amount must be positive.");
  if (BigInt(quote.receiveAmountAtomic) <= 0n) throw new Error("Receive amount must be positive.");

  const issued = Date.parse(quote.issuedAt);
  const expires = Date.parse(quote.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued) {
    throw new Error("Quote timestamps are invalid.");
  }
}

export function assertBoundQuoteUsable(
  quote: BoundCheckoutQuote,
  expected: {
    wallet: string;
    chain: BoundCheckoutQuote["chain"];
    network: BoundCheckoutQuote["network"];
    paymentAsset: BoundCheckoutQuote["paymentAsset"];
    now?: Date;
  },
): void {
  validateCheckoutQuoteCommitment(quote);
  if (!HEX_SHA256.test(quote.quoteHash)) throw new Error("Quote hash must be SHA-256 hex.");
  if (quote.wallet !== expected.wallet) throw new Error("Quote is bound to a different wallet.");
  if (quote.chain !== expected.chain) throw new Error("Quote chain mismatch.");
  if (quote.network !== expected.network) throw new Error("Quote network mismatch.");
  if (quote.paymentAsset !== expected.paymentAsset) throw new Error("Quote payment asset mismatch.");

  const now = expected.now ?? new Date();
  if (Date.parse(quote.expiresAt) <= now.getTime()) throw new Error("Quote has expired.");
}
