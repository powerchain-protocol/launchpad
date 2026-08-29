import type { LaunchAdapterRegistry } from "@powerchain/launchpad-program-client/launch/adapter";
import { LaunchService } from "./service";
import type { LaunchRepository } from "./repository";
import type { GraduationAdapterRegistryRepository } from "./graduation-registry";
import type { ReviewSnapshotRepository, ReviewSnapshotSigner } from "./review-snapshot";
import type { CrossChainLaunchAnalyticsService } from "./analytics-service";
import type { LaunchReconciliationService, ReconciliationWebhookVerifier } from "./reconciliation";
import { LaunchPreparationRecoveryService } from "./recovery";

let service: LaunchService | undefined;
let analytics: CrossChainLaunchAnalyticsService | undefined;
let reconciliation: LaunchReconciliationService | undefined;
let recovery: LaunchPreparationRecoveryService | undefined;
let webhookVerifiers: Record<string, ReconciliationWebhookVerifier> = {};

export function configureLaunchService(deps: {
  repository: LaunchRepository;
  adapters: LaunchAdapterRegistry;
  graduationRegistry: GraduationAdapterRegistryRepository;
  reviewSnapshots: ReviewSnapshotRepository;
  reviewSigner: ReviewSnapshotSigner;
}): void {
  service = new LaunchService(
    deps.repository,
    deps.adapters,
    deps.graduationRegistry,
    deps.reviewSnapshots,
    deps.reviewSigner,
  );
  recovery = new LaunchPreparationRecoveryService(deps.repository, deps.adapters);
}

export function configureLaunchAnalytics(serviceInstance: CrossChainLaunchAnalyticsService): void {
  analytics = serviceInstance;
}

export function configureLaunchReconciliation(
  serviceInstance: LaunchReconciliationService,
  verifiers: Record<string, ReconciliationWebhookVerifier>,
): void {
  reconciliation = serviceInstance;
  webhookVerifiers = verifiers;
}

export function getLaunchService(): LaunchService {
  if (!service) throw new Error("LaunchService has not been configured with production dependencies.");
  return service;
}

export function getLaunchAnalyticsService(): CrossChainLaunchAnalyticsService {
  if (!analytics) throw new Error("Launch analytics service is not configured.");
  return analytics;
}

export function getLaunchReconciliationService(): LaunchReconciliationService {
  if (!reconciliation) throw new Error("Launch reconciliation service is not configured.");
  return reconciliation;
}

export function getWebhookVerifier(provider: string): ReconciliationWebhookVerifier {
  const verifier = webhookVerifiers[provider];
  if (!verifier) throw new Error(`Unsupported reconciliation provider: ${provider}`);
  return verifier;
}


export function getLaunchRecoveryService(): LaunchPreparationRecoveryService {
  if (!recovery) throw new Error("Launch recovery service is not configured.");
  return recovery;
}
