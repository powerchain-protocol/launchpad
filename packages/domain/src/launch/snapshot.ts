import { canonicalize } from "./canonical";
import type { GraduationAdapterSelection, LaunchRecord } from "./types";

/**
 * Builds the exact Tx 2 review payload. Operational fields such as status,
 * timestamps and transaction ids are excluded by design.
 */
export function buildLaunchConfigurationSnapshotPayload(
  launch: LaunchRecord,
  adapter: GraduationAdapterSelection,
): Record<string, unknown> {
  return {
    schema: "powerchain.launch-configuration/v1",
    launchId: launch.id,
    chain: launch.chain,
    creatorWallet: launch.creatorWallet,
    tokenAddress: launch.tokenAddress ?? null,
    packageId: launch.packageId ?? null,
    token: launch.token,
    curve: launch.curve,
    payoutSplits: launch.payoutSplits,
    graduation: launch.graduation,
    graduationAdapter: adapter,
    antiBot: launch.antiBot,
    initialPurchaseLimit: launch.initialPurchaseLimit ?? { enabled: false },
    launchWindow: launch.launchWindow ?? { enabled: false },
    eligibility: launch.eligibility ?? { mode: "public" },
    devBuy: launch.devBuy ?? { enabled: false, amountAtomic: "0", paymentAsset: "" },
  };
}

export function canonicalLaunchConfiguration(
  launch: LaunchRecord,
  adapter: GraduationAdapterSelection,
): string {
  return canonicalize(buildLaunchConfigurationSnapshotPayload(launch, adapter));
}
