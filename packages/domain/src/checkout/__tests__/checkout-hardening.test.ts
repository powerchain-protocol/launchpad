import test from "node:test";
import assert from "node:assert/strict";
import {
  assertBoundQuoteUsable,
  assertSettlementTransition,
  evaluateRuntimeReadiness,
  shouldMarkExecutionUnknown,
} from "../index";

test("live Solana transfers fail closed without mint and treasury", () => {
  const report = evaluateRuntimeReadiness({
    mode: "LIVE",
    reviewSigningKeyConfigured: true,
    solana: {
      enabled: true,
      network: "mainnet-beta",
      rpcUrl: "https://rpc.example",
      pwrcMint: "TBA",
      treasuryAddress: "",
      launchpadProgramId: "Program111",
    },
  });
  assert.equal(report.liveTransfersEnabled, false);
  assert.ok(report.blockers.some((value) => value.includes("pwrcMint")));
  assert.ok(report.blockers.some((value) => value.includes("treasury")));
});

test("quote cannot be replayed by another wallet", () => {
  assert.throws(() => assertBoundQuoteUsable({
    version: 1,
    quoteId: "q1",
    chain: "solana",
    network: "mainnet-beta",
    wallet: "wallet-a",
    paymentAsset: "SOL",
    paymentAmountAtomic: "1000",
    receiveMintOrType: "pwrc",
    receiveAmountAtomic: "100000",
    treasuryAddress: "treasury",
    serviceFeeAtomic: "20",
    nonce: "n1",
    issuedAt: "2026-08-28T00:00:00.000Z",
    expiresAt: "2026-08-29T00:00:00.000Z",
    quoteHash: "a".repeat(64),
  }, {
    wallet: "wallet-b",
    chain: "solana",
    network: "mainnet-beta",
    paymentAsset: "SOL",
    now: new Date("2026-08-28T12:00:00.000Z"),
  }));
});

test("execution unknown is recoverable only through reconciliation", () => {
  assert.doesNotThrow(() => assertSettlementTransition("CONFIRMING", "EXECUTION_UNKNOWN"));
  assert.doesNotThrow(() => assertSettlementTransition("EXECUTION_UNKNOWN", "SETTLED"));
  assert.throws(() => assertSettlementTransition("EXECUTION_UNKNOWN", "RECEIPTED"));
  assert.equal(shouldMarkExecutionUnknown({
    submitted: true,
    rpcTimedOut: true,
    transactionDefinitelyAbsent: false,
  }), true);
});
