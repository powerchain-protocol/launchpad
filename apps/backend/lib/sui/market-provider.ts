import { AppError } from "@powerchain/launchpad-shared";
import type { SuiExternalMarketData, SuiMarketDataProvider } from "./types";

export interface HttpSuiMarketDataProviderOptions {
  url: string;
  bearerToken?: string;
  timeoutMs?: number;
}

function optionalFinite(value: unknown, field: string, nonNegative = false): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || (nonNegative && value < 0)) {
    throw new AppError("SERVICE_UNAVAILABLE", `Sui market provider field ${field} is invalid.`, 503);
  }
  return value;
}

function optionalCount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new AppError("SERVICE_UNAVAILABLE", "Sui market provider holderCount is invalid.", 503);
  }
  return value;
}

export class HttpSuiMarketDataProvider implements SuiMarketDataProvider {
  readonly id = "http";
  private readonly timeoutMs: number;

  constructor(private readonly options: HttpSuiMarketDataProviderOptions) {
    this.timeoutMs = options.timeoutMs ?? 8_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 30_000) {
      throw new Error("Sui market timeout must be an integer from 1,000 to 30,000 ms.");
    }
  }

  async getMarket(coinType: string): Promise<SuiExternalMarketData> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = new URL(this.options.url);
      url.searchParams.set("coinType", coinType);
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
      if (!response.ok) throw new AppError("SERVICE_UNAVAILABLE", `Sui market provider returned HTTP ${response.status}.`, 503);
      let payload: unknown;
      try { payload = await response.json(); }
      catch { throw new AppError("SERVICE_UNAVAILABLE", "Sui market provider returned malformed JSON.", 503); }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new AppError("SERVICE_UNAVAILABLE", "Sui market provider returned an invalid payload.", 503);
      }
      const data = payload as Record<string, unknown>;
      const source = typeof data.source === "string" ? data.source.trim() : "";
      const observedAt = typeof data.observedAt === "string" ? data.observedAt : "";
      if (!source) throw new AppError("SERVICE_UNAVAILABLE", "Sui market provider source is missing.", 503);
      if (!Number.isFinite(Date.parse(observedAt))) throw new AppError("SERVICE_UNAVAILABLE", "Sui market provider timestamp is invalid.", 503);
      return {
        priceUsd: optionalFinite(data.priceUsd, "priceUsd", true),
        marketCapUsd: optionalFinite(data.marketCapUsd, "marketCapUsd", true),
        fdvUsd: optionalFinite(data.fdvUsd, "fdvUsd", true),
        liquidityUsd: optionalFinite(data.liquidityUsd, "liquidityUsd", true),
        volume24hUsd: optionalFinite(data.volume24hUsd, "volume24hUsd", true),
        priceChange24hPercent: optionalFinite(data.priceChange24hPercent, "priceChange24hPercent"),
        holderCount: optionalCount(data.holderCount),
        source,
        observedAt,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AppError("SERVICE_UNAVAILABLE", "Sui market provider timed out.", 503, { retryable: true });
      }
      throw new AppError("SERVICE_UNAVAILABLE", error instanceof Error ? error.message : "Sui market provider request failed.", 503, { retryable: true });
    } finally { clearTimeout(timer); }
  }
}
