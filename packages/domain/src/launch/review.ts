import { SUI_LAUNCH_FEE_MIST, SUI_MIST_PER_SUI } from "./constants";
import type {
  GraduationAdapterSelection,
  LaunchDraft,
  TransactionReview,
} from "./types";

const humanSui = (mist: bigint) => `${mist / SUI_MIST_PER_SUI} SUI`;

export function buildTokenDeployReview(launch: LaunchDraft): TransactionReview {
  const isSui = launch.chain === "sui";
  return {
    chain: launch.chain,
    stage: "TOKEN_DEPLOY",
    title: isSui ? "Publish token package" : "Create Token-2022 mint",
    wallet: launch.creatorWallet,
    feeSummary: [{ label: "Network fee", amount: "Estimated by wallet" }],
    immutableFacts: [],
    instructions: isSui
      ? [
          { index: 0, program: "Sui", action: "Publish compiled Move package" },
          { index: 1, program: "Sui Coin Registry", action: "Create currency metadata" },
        ]
      : [
          { index: 0, program: "System", action: "Create mint account" },
          { index: 1, program: "Token-2022", action: "Initialize MetadataPointer" },
          { index: 2, program: "Token-2022", action: "Initialize mint" },
          { index: 3, program: "Token-2022", action: "Initialize TokenMetadata" },
        ],
  };
}

export function buildLaunchConfigureReview(
  launch: LaunchDraft,
  context?: { adapter?: GraduationAdapterSelection; configurationHash?: string },
): TransactionReview {
  const vesting = Boolean(launch.devBuy?.enabled && launch.devBuy.vesting?.enabled);
  const instructions: TransactionReview["instructions"] = [
    { index: 0, program: "PowerChain Launchpad", action: "Initialize launch configuration" },
    { index: 1, program: "PowerChain Launchpad", action: `Store immutable graduation venue: ${launch.graduation.venue}`, immutable: true },
    { index: 2, program: "PowerChain Launchpad", action: "Configure payout splits" },
    { index: 3, program: "PowerChain Launchpad", action: "Configure bonding curve" },
  ];

  if (context?.adapter) {
    instructions.push({
      index: instructions.length,
      program: "PowerChain Graduation Registry",
      action: `Pin approved adapter ${context.adapter.adapterId} v${context.adapter.version}`,
      immutable: true,
    });
  }

  if (launch.launchWindow?.enabled) {
    instructions.push({
      index: instructions.length,
      program: "PowerChain Launchpad",
      action: `Set launch window ${launch.launchWindow.opensAt} → ${launch.launchWindow.closesAt}`,
    });
  }

  if (launch.initialPurchaseLimit?.enabled) {
    instructions.push({
      index: instructions.length,
      program: "PowerChain Launchpad",
      action: `Set per-wallet initial purchase limit: ${launch.initialPurchaseLimit.maxPerWalletAtomic} atomic units`,
    });
  }

  if ((launch.eligibility?.mode ?? "public") !== "public") {
    instructions.push({
      index: instructions.length,
      program: "PowerChain Eligibility",
      action: `Bind ${launch.eligibility!.mode} policy ${launch.eligibility!.policyId}`,
      immutable: true,
    });
  }

  if (launch.antiBot.enabled) {
    instructions.push({
      index: instructions.length,
      program: "PowerChain Launchpad",
      action: `Set anti-bot delay: ${launch.antiBot.delaySeconds}s`,
    });
  }

  if (launch.devBuy?.enabled) {
    instructions.push({
      index: instructions.length,
      program: "PowerChain Launchpad",
      action: `Execute creator dev-buy: ${launch.devBuy.amountAtomic} atomic ${launch.devBuy.paymentAsset}`,
    });
  }

  if (vesting) {
    instructions.push({
      index: instructions.length,
      program: "PowerChain Vesting",
      action: `Route dev-buy output directly into ${launch.devBuy!.vesting!.template.name}`,
    });
  }

  if (context?.configurationHash) {
    instructions.push({
      index: instructions.length,
      program: "PowerChain Integrity",
      action: `Commit reviewed configuration hash: ${context.configurationHash}`,
      immutable: true,
    });
  }

  return {
    chain: launch.chain,
    stage: "LAUNCH_CONFIG",
    title: "Configure token launch",
    wallet: launch.creatorWallet,
    configurationHash: context?.configurationHash,
    feeSummary: launch.chain === "sui"
      ? [
          { label: "PowerChain launch fee", amount: humanSui(SUI_LAUNCH_FEE_MIST) },
          { label: "Network gas", amount: "Estimated by wallet" },
        ]
      : [
          { label: "PowerChain service fee", amount: "Calculated from configured sale economics" },
          { label: "Network fee", amount: "Estimated by wallet" },
        ],
    immutableFacts: [
      `Graduation venue: ${launch.graduation.venue}`,
      ...(context?.adapter ? [`Graduation adapter: ${context.adapter.adapterId} v${context.adapter.version}`] : []),
      ...((launch.eligibility?.mode ?? "public") !== "public" ? [`Eligibility commitment: ${launch.eligibility!.commitment}`] : []),
      ...(context?.configurationHash ? [`Review hash: ${context.configurationHash}`] : []),
      ...(vesting ? ["Dev-buy output must enter vesting atomically."] : []),
    ],
    instructions,
  };
}
