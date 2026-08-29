import {
  assertSettlementTransition,
  type SettlementEvidence,
} from "@powerchain/launchpad-domain/checkout";

export interface CheckoutOrderRepository {
  getEvidence(orderId: string): Promise<SettlementEvidence | null>;
  updateEvidence(orderId: string, patch: Partial<SettlementEvidence>): Promise<SettlementEvidence>;
}

export interface ChainSettlementVerifier {
  verify(input: SettlementEvidence): Promise<{
    status: "SETTLED" | "ABSENT" | "UNKNOWN" | "REJECTED";
    transactionId?: string;
    blockOrCheckpoint?: string;
    reason?: string;
  }>;
}

export async function reconcileCheckoutOrder(
  orderId: string,
  repository: CheckoutOrderRepository,
  verifier: ChainSettlementVerifier,
): Promise<SettlementEvidence> {
  const evidence = await repository.getEvidence(orderId);
  if (!evidence) throw new Error("Checkout order not found.");

  if (!["SUBMITTED", "CONFIRMING", "EXECUTION_UNKNOWN"].includes(evidence.state)) {
    return evidence;
  }

  const result = await verifier.verify(evidence);
  const now = new Date().toISOString();
  const attempts = (evidence.reconciliationAttempts ?? 0) + 1;

  if (result.status === "SETTLED") {
    if (evidence.state !== "EXECUTION_UNKNOWN" && evidence.state !== "CONFIRMING") {
      assertSettlementTransition(evidence.state, "CONFIRMING");
      evidence.state = "CONFIRMING";
    }
    assertSettlementTransition(evidence.state, "SETTLED");
    return repository.updateEvidence(orderId, {
      state: "SETTLED",
      transactionId: result.transactionId ?? evidence.transactionId,
      blockOrCheckpoint: result.blockOrCheckpoint,
      verifiedAt: now,
      lastRpcError: undefined,
      reconciliationAttempts: attempts,
      lastReconciledAt: now,
      updatedAt: now,
    });
  }

  if (result.status === "REJECTED") {
    assertSettlementTransition(evidence.state, "REJECTED");
    return repository.updateEvidence(orderId, {
      state: "REJECTED",
      transactionId: result.transactionId ?? evidence.transactionId,
      blockOrCheckpoint: result.blockOrCheckpoint,
      lastRpcError: result.reason ?? "Submitted transaction does not match the server-authoritative payment intent.",
      reconciliationAttempts: attempts,
      lastReconciledAt: now,
      updatedAt: now,
    });
  }

  if (result.status === "ABSENT" && evidence.state === "EXECUTION_UNKNOWN") {
    assertSettlementTransition("EXECUTION_UNKNOWN", "FAILED");
    return repository.updateEvidence(orderId, {
      state: "FAILED",
      lastRpcError: result.reason ?? "Transaction not found after reconciliation window.",
      reconciliationAttempts: attempts,
      lastReconciledAt: now,
      updatedAt: now,
    });
  }

  return repository.updateEvidence(orderId, {
    state: "EXECUTION_UNKNOWN",
    lastRpcError: result.reason ?? "RPC verification remains inconclusive.",
    reconciliationAttempts: attempts,
    lastReconciledAt: now,
    updatedAt: now,
  });
}
