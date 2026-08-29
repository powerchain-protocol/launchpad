import { evaluateRuntimeReadiness, type RuntimeReadinessReport } from "@powerchain/launchpad-domain/checkout";
import { loadRuntimeConfig } from "@powerchain/launchpad-config";

export function getRuntimeReadiness(): RuntimeReadinessReport {
  const config = loadRuntimeConfig();
  return evaluateRuntimeReadiness({
    mode: config.mode,
    reviewSigningKeyConfigured: Boolean(config.review.keyId && config.review.privateKeyPem),
    solana: {
      enabled: true,
      network: config.solana.network === "mainnet-beta" ? "mainnet-beta" : "devnet",
      rpcUrl: config.solana.rpcUrls[0],
      pwrcMint: config.solana.pwrcMint,
      treasuryAddress: config.solana.treasury,
      launchpadProgramId: config.solana.launchpadProgramId,
    },
    sui: {
      enabled: true,
      network: config.sui.network === "mainnet" ? "mainnet" : "testnet",
      rpcUrl: config.sui.grpcUrls[0],
      launchpadPackageId: config.sui.launchpadPackageId,
      feeVaultAddress: config.sui.feeVault,
    },
  });
}

export function assertLiveTransfersReady(report: RuntimeReadinessReport): void {
  if (!report.liveTransfersEnabled) throw new Error(`Live transfers are disabled: ${report.blockers.join(", ") || report.mode}.`);
}
