import { Connection } from "@solana/web3.js";
import { loadRuntimeConfig, deploymentReadiness } from "@powerchain/launchpad-config";
import { AppError } from "@powerchain/launchpad-shared";
import { configureRateLimitD1, type D1Like } from "./http/rate-limit";
import { installCheckoutD1, type D1Database } from "./checkout/d1";
import { configureCheckoutReconciliation, configureCheckoutRepository } from "./checkout/container";
import { configureQuotePricing, type QuotePricingProvider } from "./checkout/pricing";
import { HttpQuotePricingProvider } from "./checkout/http-pricing-provider";
import { D1CheckoutRepository } from "./checkout/d1-repository";
import { SolanaSettlementVerifier } from "./checkout/solana-settlement-verifier";
import { RpcQuorumSettlementVerifier } from "./checkout/rpc-quorum";
import {
  configureLaunchService,
  configureLaunchAnalytics,
  configureLaunchReconciliation,
} from "./launches/container";
import type { CrossChainLaunchAnalyticsService } from "./launches/analytics-service";
import type {
  LaunchReconciliationService,
  ReconciliationWebhookVerifier,
} from "./launches/reconciliation";
import { configureClaimsReader } from "./claims/container";
import { SolanaVestingClaimsReader } from "./claims/solana-claims-reader";
import { PublicKey } from "@solana/web3.js";

export interface PowerChainRuntimeBindings {
  d1: D1Database;
  pricing?: QuotePricingProvider;
  launch?: Parameters<typeof configureLaunchService>[0];
  checkoutReconciliation?: Parameters<typeof configureCheckoutReconciliation>[0];
  launchAnalytics?: CrossChainLaunchAnalyticsService;
  launchReconciliation?: {
    service: LaunchReconciliationService;
    verifiers: Record<string, ReconciliationWebhookVerifier>;
  };
}

function configurePricing(bindings: PowerChainRuntimeBindings): void {
  if (bindings.pricing) {
    configureQuotePricing(bindings.pricing);
    return;
  }

  const config = loadRuntimeConfig();
  if (config.pricing.url) {
    configureQuotePricing(
      new HttpQuotePricingProvider({
        url: config.pricing.url,
        ...(config.pricing.bearerToken ? { bearerToken: config.pricing.bearerToken } : {}),
        timeoutMs: config.pricing.timeoutMs,
      }),
    );
    return;
  }

  if (config.mode === "LIVE") {
    throw new AppError("SERVICE_UNAVAILABLE", "LIVE runtime requires a checkout pricing provider.", 503);
  }
}

export function configureCheckoutServices(d1: D1Database) {
  const config = loadRuntimeConfig();
  const repository = new D1CheckoutRepository(d1);
  configureCheckoutRepository(repository);
  const providers = config.solana.rpcUrls.map((url, index) => ({
    id: `solana-rpc-${index + 1}`,
    verifier: new SolanaSettlementVerifier(
      `solana-rpc-${index + 1}`,
      new Connection(url, { commitment: "confirmed" }),
      repository,
      config.solana.network,
      config.solana.usdcMint,
    ),
  }));

  if (providers.length) {
    configureCheckoutReconciliation({
      repository,
      verifier: new RpcQuorumSettlementVerifier(providers, undefined, repository),
    });
  } else if (config.mode === "LIVE") {
    throw new AppError("SERVICE_UNAVAILABLE", "LIVE runtime requires at least one Solana RPC verifier.", 503);
  }
  return repository;
}

let installed = false;

export function installPowerChainRuntimeBindings(bindings: PowerChainRuntimeBindings): void {
  if (installed) return;
  const config = loadRuntimeConfig();
  const deploymentBlockers = deploymentReadiness(config);
  if (config.mode === "LIVE" && deploymentBlockers.length) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      `Production configuration is not ready: ${deploymentBlockers.join(", ")}`,
      503,
    );
  }
  if (config.mode === "LIVE" && !bindings.launch) {
    throw new AppError("SERVICE_UNAVAILABLE", "LIVE runtime requires launch persistence and chain adapters.", 503);
  }

  installCheckoutD1(bindings.d1);
  configureRateLimitD1(bindings.d1 as unknown as D1Like);
  configurePricing(bindings);
  configureCheckoutServices(bindings.d1);
  if (config.solana.rpcUrls[0] && config.solana.vestingProgramId) {
    configureClaimsReader(new SolanaVestingClaimsReader(new Connection(config.solana.rpcUrls[0], { commitment: "confirmed" }), new PublicKey(config.solana.vestingProgramId)));
  }

  if (bindings.checkoutReconciliation) configureCheckoutReconciliation(bindings.checkoutReconciliation);
  if (bindings.launch) configureLaunchService(bindings.launch);
  if (bindings.launchAnalytics) configureLaunchAnalytics(bindings.launchAnalytics);
  if (bindings.launchReconciliation) {
    configureLaunchReconciliation(
      bindings.launchReconciliation.service,
      bindings.launchReconciliation.verifiers,
    );
  }
  installed = true;
}

export function isRuntimeBindingsInstalled(): boolean {
  return installed;
}
