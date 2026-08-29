import { AppError } from "@powerchain/launchpad-shared";
import type { SolanaExternalMarketData, SolanaMarketDataProvider } from "./types";

interface PythProviderOptions {
  baseUrl: string;
  apiKey?: string;
  feedIdsByMint: Readonly<Record<string, string>>;
  timeoutMs?: number;
}

function numberFromParts(value: unknown, exponent: unknown): number | null {
  if (typeof value !== "string" || typeof exponent !== "number" || !Number.isInteger(exponent)) return null;
  const integer = Number(value);
  if (!Number.isFinite(integer)) return null;
  const result = integer * 10 ** exponent;
  return Number.isFinite(result) && result >= 0 ? result : null;
}

export class PythMarketDataProvider implements SolanaMarketDataProvider {
  readonly id = "pyth";
  private readonly timeoutMs: number;

  constructor(private readonly options: PythProviderOptions) {
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  async getMarket(mint: string): Promise<SolanaExternalMarketData | null> {
    const feedId = this.options.feedIdsByMint[mint];
    if (!feedId) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const base = this.options.baseUrl.endsWith("/") ? this.options.baseUrl : `${this.options.baseUrl}/`;
      const url = new URL("v2/updates/price/latest", base);
      url.searchParams.append("ids[]", feedId.replace(/^0x/, ""));
      url.searchParams.set("parsed", "true");
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "cache-control": "no-store",
          ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
        },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new AppError("SERVICE_UNAVAILABLE", `Pyth returned HTTP ${response.status}.`, 503);
      const payload = await response.json() as {
        parsed?: Array<{ price?: { price?: string; conf?: string; expo?: number; publish_time?: number } }>;
      };
      const price = payload.parsed?.[0]?.price;
      const priceUsd = numberFromParts(price?.price, price?.expo);
      if (priceUsd === null) return null;
      const confidence = numberFromParts(price?.conf, price?.expo);
      const publishTime = typeof price?.publish_time === "number" ? new Date(price.publish_time * 1_000).toISOString() : null;
      return {
        priceUsd,
        marketCapUsd: null,
        fdvUsd: null,
        liquidityUsd: null,
        volume24hUsd: null,
        priceChange24hPercent: null,
        holderCount: null,
        priceConfidenceUsd: confidence,
        pricePublishTime: publishTime,
        source: "pyth",
        observedAt: publishTime ?? new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AppError("SERVICE_UNAVAILABLE", "Pyth market request timed out.", 503, { retryable: true });
      }
      throw new AppError("SERVICE_UNAVAILABLE", error instanceof Error ? error.message : "Pyth market request failed.", 503, { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }
}
