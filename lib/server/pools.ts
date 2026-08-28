import { config } from "@/lib/config";
import { sha256Hex } from "@/lib/server/canonical";
import { isConfiguredAddress } from "@/lib/server/validation";
import { getPoolAdapterCapability } from "@/lib/solana/pools/registry";
import type { LaunchPool, PoolExecutionReadiness, PoolReview, PoolVenue, Sale } from "@/types/domain";

export const poolVenues: PoolVenue[] = ["RAYDIUM_CPMM", "METEORA_DAMM_V2", "ORCA_WHIRLPOOL"];

export const venueLabels: Record<PoolVenue, string> = {
  RAYDIUM_CPMM: "Raydium CPMM",
  METEORA_DAMM_V2: "Meteora DAMM v2",
  ORCA_WHIRLPOOL: "Orca Whirlpool",
};

function positiveInteger(value: string) {
  return /^[0-9]+$/.test(value) && BigInt(value) > 0n;
}

export function poolConfigurationSnapshot(pool: LaunchPool, adapterVersion: string | null) {
  return {
    id: pool.id,
    mode: pool.mode,
    saleId: pool.saleId,
    baseMint: pool.baseMint,
    baseSymbol: pool.baseSymbol,
    baseDecimals: pool.baseDecimals,
    quoteMint: pool.quoteMint,
    quoteSymbol: pool.quoteSymbol,
    quoteDecimals: pool.quoteDecimals,
    venue: pool.venue,
    authority: pool.authority,
    treasuryWallet: pool.treasuryWallet,
    initialBaseAmount: pool.initialBaseAmount,
    initialQuoteAmount: pool.initialQuoteAmount,
    feeTierBps: pool.feeTierBps,
    launchAt: pool.launchAt,
    graduationThresholdBps: pool.graduationThresholdBps,
    adapterVersion,
  };
}

export function buildPoolReview(pool: LaunchPool, sale?: Sale | null): PoolReview {
  const configurationBlockers: string[] = [];
  const adapterVersion = config.poolAdapters[pool.venue] || null;

  if (!pool.validated) configurationBlockers.push("POOL_CONFIGURATION_NOT_VALIDATED");
  if (!isConfiguredAddress(pool.baseMint)) configurationBlockers.push("BASE_MINT_NOT_CONFIGURED");
  if (!isConfiguredAddress(pool.quoteMint)) configurationBlockers.push("QUOTE_MINT_NOT_CONFIGURED");
  if (pool.baseMint === pool.quoteMint) configurationBlockers.push("POOL_MINTS_MUST_DIFFER");
  if (!validDecimals(pool.baseDecimals)) configurationBlockers.push("INVALID_BASE_DECIMALS");
  if (!validDecimals(pool.quoteDecimals)) configurationBlockers.push("INVALID_QUOTE_DECIMALS");
  if (!isConfiguredAddress(pool.authority)) configurationBlockers.push("POOL_AUTHORITY_NOT_CONFIGURED");
  if (!isConfiguredAddress(pool.treasuryWallet)) configurationBlockers.push("TREASURY_WALLET_NOT_CONFIGURED");
  if (!positiveInteger(pool.initialBaseAmount)) configurationBlockers.push("INITIAL_BASE_LIQUIDITY_REQUIRED");
  if (!positiveInteger(pool.initialQuoteAmount)) configurationBlockers.push("INITIAL_QUOTE_LIQUIDITY_REQUIRED");
  if (!adapterVersion) configurationBlockers.push("VENUE_ADAPTER_NOT_CONFIGURED");
  if (pool.launchAt && !Number.isFinite(Date.parse(pool.launchAt))) configurationBlockers.push("INVALID_LAUNCH_TIME");
  if (pool.feeTierBps !== undefined && (!Number.isInteger(pool.feeTierBps) || pool.feeTierBps < 0 || pool.feeTierBps > 10_000)) configurationBlockers.push("INVALID_FEE_TIER_BPS");
  if (!Number.isInteger(pool.graduationThresholdBps) || pool.graduationThresholdBps <= 0 || pool.graduationThresholdBps > 10_000) configurationBlockers.push("INVALID_GRADUATION_THRESHOLD_BPS");
  if (pool.saleId) {
    if (!sale) configurationBlockers.push("LINKED_SALE_NOT_FOUND");
    else {
      if (sale.mint !== pool.baseMint) configurationBlockers.push("LINKED_SALE_MINT_MISMATCH");
      if (sale.decimals !== pool.baseDecimals) configurationBlockers.push("LINKED_SALE_DECIMALS_MISMATCH");
      if (!sale.validated) configurationBlockers.push("LINKED_SALE_NOT_VALIDATED");
    }
  }

  const generatedAt = new Date().toISOString();
  const reviewHash = sha256Hex(poolConfigurationSnapshot(pool, adapterVersion));
  const configurationValid = configurationBlockers.length === 0;
  const reviewCurrent = Boolean(
    configurationValid &&
    pool.reviewHash &&
    pool.reviewHash === reviewHash &&
    pool.reviewAdapterVersion === adapterVersion &&
    pool.reviewConfigurationRevision === pool.configurationRevision,
  );
  const blockers = [...configurationBlockers];
  if (configurationValid && !pool.reviewHash) blockers.push("REVIEW_APPROVAL_REQUIRED");
  else if (configurationValid && !reviewCurrent) blockers.push("REVIEW_SNAPSHOT_STALE");

  return {
    poolId: pool.id,
    venue: pool.venue,
    adapterConfigured: Boolean(adapterVersion),
    adapterVersion,
    configurationValid,
    reviewCurrent,
    ready: configurationValid && reviewCurrent,
    configurationBlockers,
    blockers,
    reviewHash,
    approvedReviewHash: pool.reviewHash,
    reviewedAt: pool.reviewedAt,
    reviewedBy: pool.reviewedBy,
    revision: pool.revision,
    configurationRevision: pool.configurationRevision,
    approvedConfigurationRevision: pool.reviewConfigurationRevision,
    generatedAt,
  };
}

export function validatePoolAmount(value: unknown, field: string, allowZero = false) {
  const text = String(value ?? "");
  if (!/^[0-9]+$/.test(text)) throw new Error(`${field}_MUST_BE_INTEGER_BASE_UNITS`);
  if (!allowZero && BigInt(text) <= 0n) throw new Error(`${field}_MUST_BE_GREATER_THAN_ZERO`);
  return text;
}

export function poolStatusLabel(status: LaunchPool["status"]) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function validatePoolBps(value: unknown, field: string, options: { allowZero?: boolean } = {}) {
  const number = Number(value);
  const minimum = options.allowZero ? 0 : 1;
  if (!Number.isInteger(number) || number < minimum || number > 10_000) throw new Error(`${field}_MUST_BE_INTEGER_BPS_${minimum}_TO_10000`);
  return number;
}

export function validateDecimals(value: unknown, field: string) {
  const number = Number(value);
  if (!validDecimals(number)) throw new Error(`${field}_MUST_BE_INTEGER_0_TO_18`);
  return number;
}

export function validDecimals(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 18;
}

export function formatTokenAmount(value: string, decimals: number, symbol?: string, maxFraction = 4) {
  if (!/^[0-9]+$/.test(value)) return "Invalid amount";
  const unit = 10n ** BigInt(decimals);
  const units = BigInt(value);
  const whole = units / unit;
  const fraction = (units % unit).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  const rendered = `${whole.toLocaleString()}${fraction ? `.${fraction}` : ""}`;
  return symbol ? `${rendered} ${symbol}` : rendered;
}

export function poolInitialPriceDisplay(pool: LaunchPool, maxFraction = 10) {
  if (!positiveInteger(pool.initialBaseAmount) || !positiveInteger(pool.initialQuoteAmount)) return null;
  const numerator = BigInt(pool.initialQuoteAmount) * 10n ** BigInt(pool.baseDecimals);
  const denominator = BigInt(pool.initialBaseAmount) * 10n ** BigInt(pool.quoteDecimals);
  if (denominator <= 0n) return null;
  const whole = numerator / denominator;
  let remainder = numerator % denominator;
  let fraction = "";
  for (let i = 0; i < maxFraction && remainder > 0n; i += 1) {
    remainder *= 10n;
    fraction += (remainder / denominator).toString();
    remainder %= denominator;
  }
  fraction = fraction.replace(/0+$/, "");
  return `${whole.toLocaleString()}${fraction ? `.${fraction}` : ""}`;
}

export function buildPoolExecutionReadiness(pool: LaunchPool, sale?: Sale | null): PoolExecutionReadiness {
  const review = buildPoolReview(pool, sale);
  const progress = saleGraduationProgressBps(pool, sale);
  const blockers: string[] = [];
  const capability = getPoolAdapterCapability(pool.venue);
  const launchTimeReached = !pool.launchAt || (Number.isFinite(Date.parse(pool.launchAt)) && Date.parse(pool.launchAt) <= Date.now());
  const graduationRequired = pool.mode === "SALE_GRADUATION";
  const graduationReached = graduationRequired ? Boolean(progress?.reached) : null;

  if (pool.status !== "READY") blockers.push("POOL_STATUS_NOT_READY");
  if (!review.ready) blockers.push(...review.blockers.map((item) => `REVIEW:${item}`));
  if (!launchTimeReached) blockers.push("POOL_LAUNCH_TIME_NOT_REACHED");
  if (graduationRequired && !sale) blockers.push("LINKED_SALE_NOT_FOUND");
  if (graduationRequired && sale && !progress?.reached) blockers.push("GRADUATION_THRESHOLD_NOT_REACHED");
  if (pool.poolAddress || pool.creationSignature || pool.status === "LIVE" || pool.status === "GRADUATED") blockers.push("POOL_ALREADY_CREATED_OR_RECONCILED");
  if (!review.adapterConfigured) blockers.push("VENUE_ADAPTER_NOT_CONFIGURED");
  if (!capability.implementationAvailable) blockers.push("VENUE_EXECUTION_ADAPTER_NOT_IMPLEMENTED");

  return {
    poolId: pool.id,
    executable: blockers.length === 0,
    failClosed: true,
    blockers: [...new Set(blockers)],
    status: pool.status,
    reviewReady: review.ready,
    launchTimeReached,
    graduationRequired,
    graduationReached,
    adapterConfigured: review.adapterConfigured,
    adapterVersion: review.adapterVersion,
    adapterImplementationAvailable: capability.implementationAvailable,
    configurationRevision: pool.configurationRevision,
    generatedAt: new Date().toISOString(),
  };
}

export function saleGraduationProgressBps(pool: LaunchPool, sale?: Sale | null) {
  if (pool.mode !== "SALE_GRADUATION" || !sale || sale.hardCap <= 0) return null;
  const sold = BigInt(sale.soldBaseUnits || "0");
  const cap = BigInt(Math.trunc(sale.hardCap)) * 10n ** BigInt(sale.decimals);
  if (cap <= 0n) return null;
  const soldBps = Number((sold * 10_000n) / cap);
  const threshold = pool.graduationThresholdBps;
  const progress = Math.min(10_000, Math.floor((soldBps * 10_000) / threshold));
  return { soldBps, thresholdBps: threshold, progressBps: progress, reached: soldBps >= threshold };
}
