import type {
  ChainLaunchAnalyticsInput,
  NormalizedLaunchAnalytics,
} from "./types";

function decimalString(atomic: bigint, decimals: number): string {
  if (decimals === 0) return atomic.toString();
  const scale = 10n ** BigInt(decimals);
  const whole = atomic / scale;
  const fraction = (atomic % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function normalizeLaunchAnalytics(
  input: ChainLaunchAnalyticsInput,
): NormalizedLaunchAnalytics {
  const quoteVolumeAtomic = BigInt(input.quoteVolumeAtomic);
  const sold = BigInt(input.soldAtomic);
  const threshold = BigInt(input.graduationThresholdAtomic);

  const curveProgressBps = threshold > 0n
    ? Number((sold * 10_000n) / threshold > 10_000n ? 10_000n : (sold * 10_000n) / threshold)
    : 0;

  let volumeUsdMicros: string | undefined;
  if (input.quoteUsdPriceMicros !== undefined) {
    const priceMicros = BigInt(input.quoteUsdPriceMicros);
    const scale = 10n ** BigInt(input.quoteDecimals);
    volumeUsdMicros = ((quoteVolumeAtomic * priceMicros) / scale).toString();
  }

  return {
    launchId: input.launchId,
    chain: input.chain,
    volumeQuote: decimalString(quoteVolumeAtomic, input.quoteDecimals),
    volumeUsdMicros,
    holders: input.holders,
    curveProgressBps,
    observedAt: input.observedAt,
    source: input.source,
  };
}
