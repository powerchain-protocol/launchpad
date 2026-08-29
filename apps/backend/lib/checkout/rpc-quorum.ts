import type { RpcQuorumDecision, RpcSettlementObservation, SettlementEvidence } from "@powerchain/launchpad-domain/checkout";
import type { ChainSettlementVerifier } from "./reconciliation";

export interface NamedSettlementVerifier {
  id: string;
  verifier: ChainSettlementVerifier;
}

export interface RpcObservationSink {
  recordRpcObservations(orderId: string, observations: RpcSettlementObservation[]): Promise<void>;
}

export class RpcQuorumSettlementVerifier implements ChainSettlementVerifier {
  constructor(
    private readonly providers: NamedSettlementVerifier[],
    private readonly requiredSettledVotes = Math.max(1, Math.floor(providers.length / 2) + 1),
    private readonly observationSink?: RpcObservationSink,
  ) {
    if (!providers.length) throw new Error("At least one RPC settlement verifier is required.");
    if (requiredSettledVotes < 1 || requiredSettledVotes > providers.length) {
      throw new Error("Invalid RPC quorum threshold.");
    }
  }

  async verify(evidence: SettlementEvidence): Promise<RpcQuorumDecision> {
    const observedAt = new Date().toISOString();
    const results = await Promise.all(this.providers.map(async ({ id, verifier }): Promise<RpcSettlementObservation> => {
      try {
        const result = await verifier.verify(evidence);
        return { providerId: id, ...result, observedAt };
      } catch (error) {
        return {
          providerId: id,
          status: "UNKNOWN",
          reason: error instanceof Error ? error.message : "RPC verifier failed",
          observedAt,
        };
      }
    }));

    if (this.observationSink) await this.observationSink.recordRpcObservations(evidence.orderId, results);

    const settled = results.filter((r) => r.status === "SETTLED");
    const absent = results.filter((r) => r.status === "ABSENT");
    const rejected = results.filter((r) => r.status === "REJECTED");
    const txIds = new Set(settled.map((r) => r.transactionId).filter(Boolean));

    if (txIds.size > 1) {
      return { status: "UNKNOWN", reason: "RPC providers disagree on the settled transaction id.", observations: results };
    }
    if (rejected.length >= this.requiredSettledVotes) {
      const winner = rejected[0];
      return {
        status: "REJECTED",
        transactionId: winner?.transactionId ?? evidence.transactionId,
        blockOrCheckpoint: winner?.blockOrCheckpoint,
        reason: winner?.reason ?? "RPC quorum verified a transaction that does not match the payment intent.",
        observations: results,
      };
    }
    if (settled.length >= this.requiredSettledVotes) {
      const winner = settled[0];
      return {
        status: "SETTLED",
        transactionId: winner.transactionId ?? evidence.transactionId,
        blockOrCheckpoint: winner.blockOrCheckpoint,
        observations: results,
      };
    }
    if (absent.length === this.providers.length) {
      return { status: "ABSENT", reason: "All configured RPC verifiers report the transaction absent.", observations: results };
    }
    return {
      status: "UNKNOWN",
      reason: `RPC quorum not reached (${settled.length}/${this.requiredSettledVotes} settled votes).`,
      observations: results,
    };
  }
}
