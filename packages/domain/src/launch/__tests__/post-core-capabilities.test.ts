import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalize,
  evaluateParticipationGuard,
  normalizeLaunchAnalytics,
  validateLaunchDraft,
  validateVestingTemplate,
} from "../index";

const baseDraft = {
  id: "launch_advanced",
  chain: "sui" as const,
  creatorWallet: "0x123",
  token: {
    name: "Power Test",
    symbol: "PTEST",
    description: "Test launch",
    iconUri: "https://example.com/token.png",
    decimals: 9,
  },
  curve: {
    kind: "bonding-curve" as const,
    initialPriceAtomic: "1",
    graduationThresholdAtomic: "1000000",
  },
  payoutSplits: [{ recipient: "0x123", basisPoints: 10_000 }],
  graduation: { chain: "sui" as const, venue: "cetus" as const },
  antiBot: { enabled: false, delaySeconds: 0 },
};

test("validates launch window + per-wallet limit + restricted eligibility", () => {
  assert.doesNotThrow(() => validateLaunchDraft({
    ...baseDraft,
    launchWindow: {
      enabled: true,
      opensAt: "2026-08-24T10:00:00.000Z",
      closesAt: "2026-08-25T10:00:00.000Z",
    },
    initialPurchaseLimit: { enabled: true, maxPerWalletAtomic: "500000" },
    eligibility: { mode: "allowlist", policyId: "policy_1", commitment: "root:abc" },
  }));
});

test("rejects invalid launch window", () => {
  assert.throws(() => validateLaunchDraft({
    ...baseDraft,
    launchWindow: {
      enabled: true,
      opensAt: "2026-08-25T10:00:00.000Z",
      closesAt: "2026-08-24T10:00:00.000Z",
    },
  }));
});

test("validates progressive vesting totaling 10,000 bps", () => {
  assert.doesNotThrow(() => validateVestingTemplate({
    name: "25/25/50 progressive",
    schedule: {
      kind: "progressive",
      tranches: [
        { unlockOffsetSeconds: 0, basisPoints: 2500 },
        { unlockOffsetSeconds: 2_592_000, basisPoints: 2500 },
        { unlockOffsetSeconds: 7_776_000, basisPoints: 5000 },
      ],
    },
  }));
});

test("participation guard enforces cumulative wallet limit", () => {
  const result = evaluateParticipationGuard({
    now: new Date("2026-08-24T12:00:00.000Z"),
    wallet: "0xabc",
    purchaseAtomic: "300",
    purchasedByWalletAtomic: "800",
    initialPurchaseLimit: { enabled: true, maxPerWalletAtomic: "1000" },
    eligibilitySatisfied: true,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, "WALLET_LIMIT_EXCEEDED");
});

test("canonicalization is key-order stable", () => {
  assert.equal(canonicalize({ b: 2, a: 1 }), canonicalize({ a: 1, b: 2 }));
});

test("normalizes cross-chain analytics with integer math", () => {
  const normalized = normalizeLaunchAnalytics({
    launchId: "launch_1",
    chain: "solana",
    quoteVolumeAtomic: "2500000",
    quoteDecimals: 6,
    quoteUsdPriceMicros: "1000000",
    holders: 125,
    soldAtomic: "500",
    graduationThresholdAtomic: "1000",
    observedAt: "2026-08-23T00:00:00Z",
    source: "rpc",
  });
  assert.equal(normalized.volumeQuote, "2.5");
  assert.equal(normalized.volumeUsdMicros, "2500000");
  assert.equal(normalized.curveProgressBps, 5000);
});
