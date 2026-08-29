import { AppError } from "@powerchain/launchpad-shared";
import type { SolanaExternalMarketData, SolanaMarketDataProvider } from "./types";

export interface HttpSolanaMarketDataProviderOptions {
  url: string;
  bearerToken?: string;
  timeoutMs?: number;
}

function optionalFiniteNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AppError("SERVICE_UNAVAILABLE", `Market provider field ${field} is invalid.`, 503);
  }
  return value;
}

function optionalNonNegativeFiniteNumber(value: unknown, field: string): number | null {
  const parsed = optionalFiniteNumber(value, field);
  if (parsed !== null && parsed < 0) {
    throw new AppError("SERVICE_UNAVAILABLE", `Market provider field ${field} cannot be negative.`, 503);
  }
  return parsed;
}

function optionalNonNegativeInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new AppError("SERVICE_UNAVAILABLE", `Market provider field ${field} is invalid.`, 503);
  }
  return value;
}

export class HttpSolanaMarketDataProvider implements SolanaMarketDataProvider {
  readonly id = "http";
  private readonly timeoutMs: number;

  constructor(private readonly options: HttpSolanaMarketDataProviderOptions) {
    this.timeoutMs = options.timeoutMs ?? 8_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 30_000) {
      throw new Error("Solana market timeout must be an integer from 1,000 to 30,000 ms.");
    }
  }

  async getMarket(mint: string): Promise<SolanaExternalMarketData> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = new URL(this.options.url);
      url.searchParams.set("mint", mint);
      const response = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "cache-control": "no-store",
          ...(this.options.bearerToken ? { authorization: `Bearer ${this.options.bearerToken}` } : {}),
        },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new AppError("SERVICE_UNAVAILABLE", `Solana market provider returned HTTP ${response.status}.`, 503);

      let payload: unknown;
      try { payload = await response.json(); }
      catch { throw new AppError("SERVICE_UNAVAILABLE", "Solana market provider returned malformed JSON.", 503); }
      if (!payload || typeof payload !== "object") throw new AppError("SERVICE_UNAVAILABLE", "Solana market provider returned an invalid payload.", 503);
      const data = payload as Record<string, unknown>;
      const source = data.source;
      const observedAt = data.observedAt;
      if (typeof source !== "string" || !source.trim()) throw new AppError("SERVICE_UNAVAILABLE", "Solana market provider source is missing.", 503);
      if (typeof observedAt !== "string" || !Number.isFinite(Date.parse(observedAt))) throw new AppError("SERVICE_UNAVAILABLE", "Solana market provider timestamp is invalid.", 503);

      return {
        priceUsd: optionalNonNegativeFiniteNumber(data.priceUsd, "priceUsd"),
        marketCapUsd: optionalNonNegativeFiniteNumber(data.marketCapUsd, "marketCapUsd"),
        fdvUsd: optionalNonNegativeFiniteNumber(data.fdvUsd, "fdvUsd"),
        liquidityUsd: optionalNonNegativeFiniteNumber(data.liquidityUsd, "liquidityUsd"),
        volume24hUsd: optionalNonNegativeFiniteNumber(data.volume24hUsd, "volume24hUsd"),
        priceChange24hPercent: optionalFiniteNumber(data.priceChange24hPercent, "priceChange24hPercent"),
        holderCount: optionalNonNegativeInteger(data.holderCount, "holderCount"),
        priceConfidenceUsd: optionalNonNegativeFiniteNumber(data.priceConfidenceUsd, "priceConfidenceUsd"),
        pricePublishTime: typeof data.pricePublishTime === "string" && Number.isFinite(Date.parse(data.pricePublishTime)) ? data.pricePublishTime : null,
        source: source.trim(),
        observedAt,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AppError("SERVICE_UNAVAILABLE", "Solana market provider timed out.", 503, { retryable: true });
      }
      throw new AppError("SERVICE_UNAVAILABLE", error instanceof Error ? error.message : "Solana market provider request failed.", 503, { retryable: true });
    } finally { clearTimeout(timeout); }
  }
}
