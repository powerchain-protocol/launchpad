import test from "node:test";
import assert from "node:assert/strict";
import {
  SUI_LAUNCH_FEE_MIST,
  assertGraduationVenueMutationAllowed,
  assertLaunchTransition,
  validateLaunchDraft,
} from "../index";

const draft = {
  id: "launch_1",
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

test("Sui launch fee is exactly 2 SUI", () => {
  assert.equal(SUI_LAUNCH_FEE_MIST, 2_000_000_000n);
});

test("rejects a cross-chain venue", () => {
  assert.throws(() =>
    validateLaunchDraft({
      ...draft,
      graduation: { chain: "sui", venue: "raydium" as never },
    }),
  );
});

test("requires payout splits to equal 10,000 bps", () => {
  assert.throws(() =>
    validateLaunchDraft({
      ...draft,
      payoutSplits: [{ recipient: "0x123", basisPoints: 9_999 }],
    }),
  );
});

test("locks graduation venue after configuration", () => {
  assert.throws(() =>
    assertGraduationVenueMutationAllowed(
      {
        graduationVenueLocked: true,
        graduation: { chain: "sui", venue: "cetus" },
      },
      { chain: "sui", venue: "turbos" },
    ),
  );
});

test("requires two-stage launch transition", () => {
  assert.doesNotThrow(() => assertLaunchTransition("DRAFT", "TOKEN_DEPLOY_PENDING"));
  assert.doesNotThrow(() => assertLaunchTransition("TOKEN_DEPLOY_PENDING", "TOKEN_DEPLOYED"));
  assert.doesNotThrow(() => assertLaunchTransition("TOKEN_DEPLOYED", "LAUNCH_CONFIG_PENDING"));
  assert.doesNotThrow(() => assertLaunchTransition("LAUNCH_CONFIG_PENDING", "LIVE"));
  assert.throws(() => assertLaunchTransition("DRAFT", "LIVE"));
});
