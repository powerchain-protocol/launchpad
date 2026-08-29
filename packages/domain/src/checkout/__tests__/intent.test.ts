import test from "node:test";
import assert from "node:assert/strict";
import { assertParsedTransactionMatchesIntent, type CheckoutTransactionIntent } from "../index";

const intent: CheckoutTransactionIntent = {
  version: 1, orderId: "o1", quoteId: "q1", quoteHash: "a".repeat(64), intentHash: "b".repeat(64),
  chain: "solana", network: "mainnet-beta", wallet: "wallet1", serviceFeeAtomic: "20",
  transfers: [{ recipient: "treasury", asset: "SOL", amountAtomic: "1000" }],
  issuedAt: "2026-08-28T00:00:00.000Z", expiresAt: "2026-08-29T00:00:00.000Z",
};

test("transaction effects must match checkout intent exactly", () => {
  assert.doesNotThrow(() => assertParsedTransactionMatchesIntent(intent, {
    chain: "solana", network: "mainnet-beta", wallet: "wallet1", transactionId: "tx", quoteHash: "a".repeat(64),
    transfers: [{ recipient: "treasury", asset: "SOL", amountAtomic: "1000" }],
  }, new Date("2026-08-28T01:00:00.000Z")));
  assert.throws(() => assertParsedTransactionMatchesIntent(intent, {
    chain: "solana", network: "mainnet-beta", wallet: "wallet1", transactionId: "tx",
    transfers: [{ recipient: "attacker", asset: "SOL", amountAtomic: "1000" }],
  }, new Date("2026-08-28T01:00:00.000Z")));
});
