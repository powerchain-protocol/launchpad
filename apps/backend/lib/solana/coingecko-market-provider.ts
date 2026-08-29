import { AppError } from "@powerchain/launchpad-shared";
import type { SolanaExternalMarketData, SolanaMarketDataProvider } from "./types";

interface CoinGeckoProviderOptions {
  baseUrl: string;
  apiKey?: string;
  apiKeyHeader?: "x-cg-demo-api-key" | "x-cg-pro-api-key";
  timeoutMs?: number;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function nestedNumber(record: Record<string, unknown>, key: string, child: string): number | null {
  const value = record[key];
  return value && typeof value === "object" ? numberOrNull((value as Record<string, unknown>)[child]) : null;
}

export class CoinGeckoMarketDataProvider implements SolanaMarketDataProvider {
  readonly id = "coingecko";
  private readonly timeoutMs: number;

  constructor(private readonly options: CoinGeckoProviderOptions) {
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  async getMarket(mint: string): Promise<SolanaExternalMarketData | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const base = this.options.baseUrl.replace(/\/$/, "");
      const url = new URL(`${base}/onchain/networks/solana/tokens/${encodeURIComponent(mint)}`);
      url.searchParams.set("include", "top_pools");
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "cache-control": "no-store",
          ...(this.options.apiKey
            ? { [this.options.apiKeyHeader ?? "x-cg-demo-api-key"]: this.options.apiKey }
            : {}),
        },
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new AppError("SERVICE_UNAVAILABLE", `CoinGecko returned HTTP ${response.status}.`, 503);
      const payload = await response.json() as { data?: { attributes?: Record<string, unknown> }; included?: Array<{ attributes?: Record<string, unknown> }> };
      const attributes = payload.data?.attributes;
      if (!attributes || typeof attributes !== "object") return null;
      const priceUsd = numberOrNull(attributes.price_usd);
      const marketCapUsd = numberOrNull(attributes.market_cap_usd);
      const fdvUsd = numberOrNull(attributes.fdv_usd);
      const liquidityUsd = numberOrNull(attributes.total_reserve_in_usd);
      const volume24hUsd = nestedNumber(attributes, "volume_usd", "h24");
      const topPoolAttributes = payload.included?.[0]?.attributes;
      const priceChange24hPercent = topPoolAttributes ? nestedNumber(topPoolAttributes, "price_change_percentage", "h24") : null;
      const holderCount = numberOrNull(attributes.holders) ?? numberOrNull(attributes.holder_count);
      if ([priceUsd, marketCapUsd, fdvUsd, liquidityUsd, volume24hUsd, priceChange24hPercent, holderCount].every((value) => value === null)) return null;
      return {
        priceUsd,
        marketCapUsd,
        fdvUsd,
        liquidityUsd,
        volume24hUsd,
        priceChange24hPercent,
        holderCount: holderCount !== null && holderCount >= 0 ? Math.trunc(holderCount) : null,
        priceConfidenceUsd: null,
        pricePublishTime: null,
        source: "coingecko",
        observedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AppError("SERVICE_UNAVAILABLE", "CoinGecko market request timed out.", 503, { retryable: true });
      }
      throw new AppError("SERVICE_UNAVAILABLE", error instanceof Error ? error.message : "CoinGecko market request failed.", 503, { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }
}
