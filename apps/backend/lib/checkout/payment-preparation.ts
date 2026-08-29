import { AppError } from "@powerchain/launchpad-shared";
import type { RuntimeReadinessReport } from "@powerchain/launchpad-domain/checkout";

export function assertLiveExecutionReady(report: RuntimeReadinessReport, chain: "solana" | "sui"): void {
  const selected = report.chains.find((entry) => entry.chain === chain);
  if (report.mode !== "LIVE" || !report.liveTransfersEnabled || !selected?.transferEnabled) {
    throw new AppError("SERVICE_UNAVAILABLE", "LIVE_EXECUTION_DISABLED: runtime readiness does not permit this transfer.", 503, { details: { blockers: report.blockers, chain } });
  }
}

export function decimalToAtomic(value: string, decimals: number): string {
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) throw new AppError("BAD_REQUEST", "Payment amount must be a positive decimal string.", 400);
  const [whole = "0", fraction = ""] = value.trim().split(".");
  if (fraction.length > decimals) throw new AppError("BAD_REQUEST", `Payment asset supports at most ${decimals} decimal places.`, 400);
  const atomic = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (atomic <= 0n) throw new AppError("BAD_REQUEST", "Payment amount must be positive.", 400);
  return atomic.toString();
}

export function feeAtomic(amountAtomic: string, basisPoints: number): string {
  const amount = BigInt(amountAtomic);
  return ((amount * BigInt(basisPoints) + 9_999n) / 10_000n).toString();
}
