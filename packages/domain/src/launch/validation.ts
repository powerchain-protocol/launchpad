import {
  BASIS_POINTS_TOTAL,
  CONFIGURATION_HASH_HEX_LENGTH,
  MAX_ADAPTER_ID_LENGTH,
  MAX_ANTI_BOT_DELAY_SECONDS,
  MAX_ICON_URI_LENGTH,
  MAX_PAYOUT_RECIPIENTS,
  MAX_TOKEN_DESCRIPTION_LENGTH,
  MAX_TOKEN_NAME_LENGTH,
  MAX_TOKEN_SYMBOL_LENGTH,
} from "./constants";
import { assertVenueForChain } from "./chains";
import { validateVestingTemplate } from "./vesting";
import type {
  GraduationAdapterSelection,
  LaunchDraft,
  LaunchWindowConfig,
} from "./types";

const nonNegativeInteger = (value: number) =>
  Number.isSafeInteger(value) && value >= 0;

const positiveAtomic = (value: string | undefined) => {
  if (!value || !/^\d+$/.test(value)) return false;
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
};

function assertText(name: string, value: string, max: number): void {
  const clean = value.trim();
  if (!clean) throw new Error(`${name} is required.`);
  if (clean.length > max) throw new Error(`${name} exceeds ${max} characters.`);
  if (/[\u0000-\u001F\u007F]/.test(clean)) {
    throw new Error(`${name} contains control characters.`);
  }
}

function validateLaunchWindow(window?: LaunchWindowConfig): void {
  if (!window?.enabled) return;
  if (!window.opensAt || !window.closesAt) {
    throw new Error("Enabled launch window requires opensAt and closesAt.");
  }
  const opens = Date.parse(window.opensAt);
  const closes = Date.parse(window.closesAt);
  if (!Number.isFinite(opens) || !Number.isFinite(closes)) {
    throw new Error("Launch window timestamps must be valid ISO-8601 values.");
  }
  if (closes <= opens) throw new Error("Launch window must close after it opens.");
}

export function validateReviewHash(hash: string): string {
  if (!new RegExp(`^[a-f0-9]{${CONFIGURATION_HASH_HEX_LENGTH}}$`, "i").test(hash)) {
    throw new Error("Configuration review hash must be a 32-byte SHA-256 hex digest.");
  }
  return hash.toLowerCase();
}

export function validateGraduationAdapterSelection(
  adapter: GraduationAdapterSelection,
): GraduationAdapterSelection {
  assertText("Graduation adapter registry id", adapter.registryId, MAX_ADAPTER_ID_LENGTH);
  assertText("Graduation adapter id", adapter.adapterId, MAX_ADAPTER_ID_LENGTH);
  if (!Number.isSafeInteger(adapter.version) || adapter.version <= 0) {
    throw new Error("Graduation adapter version must be a positive integer.");
  }
  if (adapter.configHash) validateReviewHash(adapter.configHash);
  return adapter;
}

export function validateLaunchDraft(input: LaunchDraft): LaunchDraft {
  if (!input.id.trim()) throw new Error("Launch id is required.");
  if (!input.creatorWallet.trim()) throw new Error("Creator wallet is required.");

  assertText("Token name", input.token.name, MAX_TOKEN_NAME_LENGTH);
  assertText("Token symbol", input.token.symbol, MAX_TOKEN_SYMBOL_LENGTH);
  assertText("Token description", input.token.description, MAX_TOKEN_DESCRIPTION_LENGTH);
  assertText("Token icon URI", input.token.iconUri, MAX_ICON_URI_LENGTH);

  if (!Number.isInteger(input.token.decimals) || input.token.decimals < 0 || input.token.decimals > 18) {
    throw new Error("Token decimals must be an integer from 0 to 18.");
  }

  assertVenueForChain(input.chain, input.graduation.venue);
  if (input.graduation.chain !== input.chain) {
    throw new Error("Graduation chain must match launch chain.");
  }

  if (input.payoutSplits.length < 1 || input.payoutSplits.length > MAX_PAYOUT_RECIPIENTS) {
    throw new Error(`Payout split count must be between 1 and ${MAX_PAYOUT_RECIPIENTS}.`);
  }

  const recipients = new Set<string>();
  let totalBps = 0;
  for (const split of input.payoutSplits) {
    const recipient = split.recipient.trim();
    if (!recipient) throw new Error("Payout recipient is required.");
    if (recipients.has(recipient)) throw new Error(`Duplicate payout recipient: ${recipient}`);
    recipients.add(recipient);
    if (!Number.isInteger(split.basisPoints) || split.basisPoints <= 0) {
      throw new Error("Payout basis points must be positive integers.");
    }
    totalBps += split.basisPoints;
  }
  if (totalBps !== BASIS_POINTS_TOTAL) {
    throw new Error(`Payout splits must sum to ${BASIS_POINTS_TOTAL} bps; got ${totalBps}.`);
  }

  if (!nonNegativeInteger(input.antiBot.delaySeconds)) {
    throw new Error("Anti-bot delay must be a non-negative integer.");
  }
  if (input.antiBot.delaySeconds > MAX_ANTI_BOT_DELAY_SECONDS) {
    throw new Error(`Anti-bot delay cannot exceed ${MAX_ANTI_BOT_DELAY_SECONDS} seconds.`);
  }
  if (!input.antiBot.enabled && input.antiBot.delaySeconds !== 0) {
    throw new Error("Disabled anti-bot protection must have a zero-second delay.");
  }

  if (!positiveAtomic(input.curve.initialPriceAtomic)) {
    throw new Error("Initial price must be a positive atomic amount.");
  }
  if (!positiveAtomic(input.curve.graduationThresholdAtomic)) {
    throw new Error("Graduation threshold must be a positive atomic amount.");
  }

  if (input.initialPurchaseLimit?.enabled && !positiveAtomic(input.initialPurchaseLimit.maxPerWalletAtomic)) {
    throw new Error("Enabled initial purchase limit requires a positive maxPerWalletAtomic.");
  }

  validateLaunchWindow(input.launchWindow);

  const eligibility = input.eligibility ?? { mode: "public" as const };
  if (eligibility.mode !== "public") {
    if (!eligibility.policyId?.trim()) throw new Error("Restricted launch requires an eligibility policy id.");
    if (!eligibility.commitment?.trim()) throw new Error("Restricted launch requires an immutable eligibility commitment.");
  }

  if (input.devBuy?.enabled) {
    if (!positiveAtomic(input.devBuy.amountAtomic)) {
      throw new Error("Enabled dev-buy requires a positive amount.");
    }
    if (!input.devBuy.paymentAsset.trim()) {
      throw new Error("Enabled dev-buy requires a payment asset.");
    }
    if (input.devBuy.vesting?.enabled) {
      validateVestingTemplate(input.devBuy.vesting.template);
    }
  }

  return input;
}

export function assertGraduationVenueMutationAllowed(
  current: { graduationVenueLocked: boolean; graduation: LaunchDraft["graduation"] },
  next: LaunchDraft["graduation"],
): void {
  if (
    current.graduationVenueLocked &&
    (current.graduation.chain !== next.chain || current.graduation.venue !== next.venue)
  ) {
    throw new Error("Graduation venue is immutable after launch configuration.");
  }
}
