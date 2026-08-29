import type { LaunchService } from "./service";

export interface ReconciliationWebhookEvent {
  provider: string;
  launchId: string;
  stage: "TOKEN_DEPLOY" | "LAUNCH_CONFIG";
  transactionId: string;
  eventId: string;
  observedAt: string;
}

export interface ReconciliationWebhookVerifier {
  verify(request: Request): Promise<ReconciliationWebhookEvent>;
}

export interface ReconciliationEventRepository {
  claimEvent(provider: string, eventId: string): Promise<boolean>;
  markProcessed(provider: string, eventId: string, outcome: string): Promise<void>;
}

/**
 * Webhooks/indexers are acceleration hints only. State advances through the
 * same LaunchService confirmation path, which performs RPC/on-chain verification.
 */
export class LaunchReconciliationService {
  constructor(
    private readonly launchService: LaunchService,
    private readonly events: ReconciliationEventRepository,
  ) {}

  async reconcile(event: ReconciliationWebhookEvent): Promise<void> {
    const claimed = await this.events.claimEvent(event.provider, event.eventId);
    if (!claimed) return;

    try {
      if (event.stage === "TOKEN_DEPLOY") {
        await this.launchService.confirmToken(event.launchId, event.transactionId);
      } else {
        await this.launchService.confirmConfiguration(event.launchId, event.transactionId);
      }
      await this.events.markProcessed(event.provider, event.eventId, "rpc_verified");
    } catch (error) {
      await this.events.markProcessed(
        event.provider,
        event.eventId,
        error instanceof Error ? `verification_failed:${error.message}` : "verification_failed",
      );
      throw error;
    }
  }
}
