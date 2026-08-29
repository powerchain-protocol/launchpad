import type { ChainSubmissionContext } from "./types";

export function assertSubmissionContextUsable(
  context: ChainSubmissionContext,
  current: { solanaBlockHeight?: number },
): void {
  if (context.chain === "solana") {
    if (!context.blockhash.trim()) throw new Error("Solana blockhash is required.");
    if (!Number.isSafeInteger(context.lastValidBlockHeight) || context.lastValidBlockHeight <= 0) {
      throw new Error("Solana lastValidBlockHeight is invalid.");
    }
    if (
      current.solanaBlockHeight !== undefined &&
      current.solanaBlockHeight > context.lastValidBlockHeight
    ) {
      throw new Error("Solana transaction blockhash has expired; rebuild before signing.");
    }
  }
}
