import type {
  CheckoutNetwork,
  RuntimeChainReadiness,
  RuntimeMode,
  RuntimeReadinessReport,
} from "./types";

const PLACEHOLDER = /^(?:|0x0|todo|tba|changeme|replace_me|example|undefined|null)$/i;

export interface RuntimeReadinessInput {
  mode: RuntimeMode;
  solana?: {
    enabled: boolean;
    network: Extract<CheckoutNetwork, "devnet" | "mainnet-beta">;
    rpcUrl?: string;
    pwrcMint?: string;
    treasuryAddress?: string;
    launchpadProgramId?: string;
  };
  sui?: {
    enabled: boolean;
    network: Extract<CheckoutNetwork, "testnet" | "mainnet">;
    rpcUrl?: string;
    launchpadPackageId?: string;
    feeVaultAddress?: string;
  };
  reviewSigningKeyConfigured: boolean;
}

function configured(value?: string): boolean {
  return Boolean(value && !PLACEHOLDER.test(value.trim()));
}

export function evaluateRuntimeReadiness(input: RuntimeReadinessInput): RuntimeReadinessReport {
  const chains: RuntimeChainReadiness[] = [];

  if (input.solana?.enabled) {
    const checks = [
      { id: "solana.rpc", ok: configured(input.solana.rpcUrl), required: true, detail: "Solana RPC URL configured" },
      { id: "solana.pwrcMint", ok: configured(input.solana.pwrcMint), required: true, detail: "PWRC mint configured" },
      { id: "solana.treasury", ok: configured(input.solana.treasuryAddress), required: true, detail: "Treasury address configured" },
      { id: "solana.launchpadProgram", ok: configured(input.solana.launchpadProgramId), required: true, detail: "Launchpad program configured" },
      { id: "review.signingKey", ok: input.reviewSigningKeyConfigured, required: true, detail: "Review-signing key configured" },
    ];
    const ready = checks.filter((check) => check.required).every((check) => check.ok);
    chains.push({
      chain: "solana",
      network: input.solana.network,
      ready,
      transferEnabled: input.mode === "LIVE" && ready,
      checks,
    });
  }

  if (input.sui?.enabled) {
    const checks = [
      { id: "sui.rpc", ok: configured(input.sui.rpcUrl), required: true, detail: "Sui RPC URL configured" },
      { id: "sui.launchpadPackage", ok: configured(input.sui.launchpadPackageId), required: true, detail: "Launchpad package configured" },
      { id: "sui.feeVault", ok: configured(input.sui.feeVaultAddress), required: true, detail: "Fee vault configured" },
      { id: "review.signingKey", ok: input.reviewSigningKeyConfigured, required: true, detail: "Review-signing key configured" },
    ];
    const ready = checks.filter((check) => check.required).every((check) => check.ok);
    chains.push({
      chain: "sui",
      network: input.sui.network,
      ready,
      transferEnabled: input.mode === "LIVE" && ready,
      checks,
    });
  }

  const blockers = chains.flatMap((chain) =>
    chain.checks
      .filter((check) => check.required && !check.ok)
      .map((check) => `${chain.chain}:${check.id}`),
  );

  return {
    mode: input.mode,
    liveTransfersEnabled:
      input.mode === "LIVE" && chains.length > 0 && chains.every((chain) => chain.transferEnabled),
    generatedAt: new Date().toISOString(),
    chains,
    blockers,
  };
}
