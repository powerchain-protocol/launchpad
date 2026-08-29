import type {
  InitialPurchaseLimitConfig,
  LaunchEligibilityConfig,
  LaunchWindowConfig,
} from "./types";

export interface ParticipationGuardInput {
  now: Date;
  wallet: string;
  purchaseAtomic: string;
  purchasedByWalletAtomic: string;
  initialPurchaseLimit?: InitialPurchaseLimitConfig;
  launchWindow?: LaunchWindowConfig;
  eligibility?: LaunchEligibilityConfig;
  eligibilitySatisfied: boolean;
}

export interface ParticipationGuardResult {
  allowed: boolean;
  code?:
    | "LAUNCH_NOT_OPEN"
    | "LAUNCH_CLOSED"
    | "WALLET_LIMIT_EXCEEDED"
    | "NOT_ELIGIBLE";
  reason?: string;
}

export function evaluateParticipationGuard(
  input: ParticipationGuardInput,
): ParticipationGuardResult {
  if (input.launchWindow?.enabled) {
    const opensAt = new Date(input.launchWindow.opensAt!);
    const closesAt = new Date(input.launchWindow.closesAt!);
    if (input.now < opensAt) {
      return { allowed: false, code: "LAUNCH_NOT_OPEN", reason: "Launch window has not opened." };
    }
    if (input.now >= closesAt) {
      return { allowed: false, code: "LAUNCH_CLOSED", reason: "Launch window is closed." };
    }
  }

  if (input.initialPurchaseLimit?.enabled) {
    const max = BigInt(input.initialPurchaseLimit.maxPerWalletAtomic!);
    const prior = BigInt(input.purchasedByWalletAtomic);
    const next = BigInt(input.purchaseAtomic);
    if (prior + next > max) {
      return { allowed: false, code: "WALLET_LIMIT_EXCEEDED", reason: "Per-wallet initial purchase limit exceeded." };
    }
  }

  if ((input.eligibility?.mode ?? "public") !== "public" && !input.eligibilitySatisfied) {
    return { allowed: false, code: "NOT_ELIGIBLE", reason: "Wallet does not satisfy launch eligibility policy." };
  }

  return { allowed: true };
}
