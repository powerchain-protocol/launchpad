import {
  buildLaunchConfigureReview,
  validateGraduationAdapterSelection,
  validateLaunchDraft,
  validateReviewHash,
  type GraduationAdapterSelection,
  type LaunchDraft,
} from "@powerchain/launchpad-domain/launch";
import type { SolanaInstructionPlan, SolanaLaunchEnvironment } from "./types";

const venueCode = (venue: "raydium" | "meteora" | "orca"): number => {
  switch (venue) {
    case "raydium": return 0;
    case "meteora": return 1;
    case "orca": return 2;
  }
};

const eligibilityCode = (mode: "public" | "allowlist" | "private"): number =>
  mode === "public" ? 0 : mode === "allowlist" ? 1 : 2;

export function buildSolanaConfigureLaunchPlan(
  launch: LaunchDraft & {
    chain: "solana";
    graduation: { chain: "solana"; venue: "raydium" | "meteora" | "orca" };
  },
  environment: SolanaLaunchEnvironment,
  mintAddress: string,
  launchPda: string,
  graduationAdapter: GraduationAdapterSelection,
  reviewHash: string,
  vestingPda?: string,
): SolanaInstructionPlan {
  validateLaunchDraft(launch);
  validateGraduationAdapterSelection(graduationAdapter);
  validateReviewHash(reviewHash);

  const eligibility = launch.eligibility ?? { mode: "public" as const };
  const window = launch.launchWindow?.enabled ? launch.launchWindow : undefined;
  const limit = launch.initialPurchaseLimit?.enabled
    ? launch.initialPurchaseLimit.maxPerWalletAtomic!
    : "0";

  const instructions: SolanaInstructionPlan["instructions"] = [
    {
      programId: environment.launchpadProgramId,
      name: "initializeLaunch",
      accounts: [
        launch.creatorWallet,
        mintAddress,
        launchPda,
        environment.serviceFeeRecipient,
        ...(graduationAdapter.registryEntryAddress ? [graduationAdapter.registryEntryAddress] : []),
      ],
      data: {
        graduationVenue: venueCode(launch.graduation.venue),
        graduationVenueLocked: true,
        graduationAdapterId: graduationAdapter.adapterId,
        graduationAdapterVersion: graduationAdapter.version,
        graduationAdapterConfigHash: graduationAdapter.configHash ?? "",
        reviewHash,
        initialPriceAtomic: launch.curve.initialPriceAtomic,
        graduationThresholdAtomic: launch.curve.graduationThresholdAtomic,
        antiBotDelaySeconds: launch.antiBot.enabled ? launch.antiBot.delaySeconds : 0,
        maxInitialPurchasePerWalletAtomic: limit,
        launchWindowOpenAt: window?.opensAt ?? "",
        launchWindowCloseAt: window?.closesAt ?? "",
        eligibilityMode: eligibilityCode(eligibility.mode),
        eligibilityPolicyId: eligibility.policyId ?? "",
        eligibilityCommitment: eligibility.commitment ?? "",
        payoutRecipients: launch.payoutSplits.map((split) => split.recipient),
        payoutBps: launch.payoutSplits.map((split) => split.basisPoints.toString()),
      },
    },
  ];

  if (launch.devBuy?.enabled) {
    instructions.push({
      programId: environment.launchpadProgramId,
      name: "devBuy",
      accounts: [launch.creatorWallet, mintAddress, launchPda],
      data: {
        paymentAsset: launch.devBuy.paymentAsset,
        amountAtomic: launch.devBuy.amountAtomic,
        routeToVesting: Boolean(launch.devBuy.vesting?.enabled),
      },
    });
  }

  if (launch.devBuy?.enabled && launch.devBuy.vesting?.enabled) {
    if (!vestingPda) throw new Error("Vesting PDA is required for a vested dev-buy.");
    const template = launch.devBuy.vesting.template;
    instructions.push({
      programId: environment.launchpadProgramId,
      name: "initializeDevVesting",
      accounts: [launch.creatorWallet, mintAddress, launchPda, vestingPda],
      data: {
        beneficiary: launch.creatorWallet,
        templateName: template.name,
        scheduleKind: template.schedule.kind,
        schedule: JSON.stringify(template.schedule),
      },
    });
  }

  return {
    payer: launch.creatorWallet,
    mint: mintAddress,
    stage: "LAUNCH_CONFIG",
    instructions,
    requiredSigners: [launch.creatorWallet],
    review: buildLaunchConfigureReview(launch, {
      adapter: graduationAdapter,
      configurationHash: reviewHash,
    }),
  };
}
