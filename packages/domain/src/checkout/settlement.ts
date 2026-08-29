import type { SettlementState } from "./types";

const transitions: Record<SettlementState, readonly SettlementState[]> = {
  CREATED: ["QUOTED", "CANCELLED", "FAILED"],
  QUOTED: ["AWAITING_SIGNATURE", "EXPIRED", "CANCELLED", "FAILED"],
  AWAITING_SIGNATURE: ["SUBMITTED", "EXPIRED", "CANCELLED", "FAILED"],
  SUBMITTED: ["CONFIRMING", "EXECUTION_UNKNOWN", "FAILED", "REJECTED"],
  CONFIRMING: ["SETTLED", "EXECUTION_UNKNOWN", "FAILED", "REJECTED"],
  EXECUTION_UNKNOWN: ["SETTLED", "FAILED", "REJECTED"],
  SETTLED: ["RECONCILED"],
  RECONCILED: ["RECEIPTED"],
  RECEIPTED: [],
  EXPIRED: [],
  CANCELLED: [],
  FAILED: [],
  REJECTED: [],
};

export function canTransitionSettlement(from: SettlementState, to: SettlementState): boolean {
  return transitions[from].includes(to);
}

export function assertSettlementTransition(from: SettlementState, to: SettlementState): void {
  if (!canTransitionSettlement(from, to)) {
    throw new Error(`Invalid settlement transition: ${from} -> ${to}.`);
  }
}

export function shouldMarkExecutionUnknown(input: {
  submitted: boolean;
  rpcTimedOut: boolean;
  transactionDefinitelyAbsent: boolean;
}): boolean {
  return input.submitted && input.rpcTimedOut && !input.transactionDefinitelyAbsent;
}
