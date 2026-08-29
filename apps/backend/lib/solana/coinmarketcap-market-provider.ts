import { AppError } from "@powerchain/launchpad-shared";
import type { SolanaExternalMarketData, SolanaMarketDataProvider } from "./types";

interface CoinMarketCapProviderOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export class CoinMarketCapMarketDataProvider implements SolanaMarketDataProvider {
  readonly id = "coinmarketcap";
  private readonly timeoutMs: number;

  constructor(private readonly options: CoinMarketCapProviderOptions) {
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }


  async getMarket(mint: string): Promise<SolanaExternalMarketData | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const signal = controller.signal;
      const originalFetch = globalThis.fetch;
      // Keep the provider deadline authoritative across its subrequests.
      const requestWithSignal = async (path: string, params: Record<string, string>): Promise<unknown> => {
        const base = this.options.baseUrl.replace(/\/$/, "");
        const prefix = this.options.apiKey ? "" : "/public-api";
        const url = new URL(`${base}${prefix}${path}`);
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        const response = await originalFetch(url, {
          headers: {
            accept: "application/json",
            "cache-control": "no-store",
            ...(this.options.apiKey ? { "X-CMC_PRO_API_KEY": this.options.apiKey } : {}),
          },
          cache: "no-store",
          signal,
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new AppError("SERVICE_UNAVAILABLE", `CoinMarketCap returned HTTP ${response.status}.`, 503);
        return response.json();
      };

      const [detailPayload, holderPayload, poolsPayload] = await Promise.all([
        requestWithSignal("/v1/dex/token", { platform: "solana", address: mint }),
        requestWithSignal("/v1/dex/holders/count", { platform: "solana", tokenAddress: mint }).catch(() => null),
        requestWithSignal("/v1/dex/token/pools", { platform: "solana", address: mint, size: "20" }).catch(() => null),
      ]);

      const payload = object(detailPayload) ?? {};
      const stats = Array.isArray(payload.sts)
        ? payload.sts.find((value) => object(value)?.tp === "24h") as Record<string, unknown> | undefined
        : undefined;
      const priceUsd = finite(payload.p);
      const marketCapUsd = finite(payload.mcap);
      const fdvUsd = finite(payload.fdv);
      const detailLiquidity = finite(payload.liqUsd);
      const detailVolume = finite(stats?.vu);
      const priceChange24hPercent = finite(stats?.pc);

      const holderObject = object(holderPayload);
      const holderCountRaw = finite(holderObject?.count) ?? finite(payload.hld);

      const pools = Array.isArray(poolsPayload) ? poolsPayload.map(object).filter(Boolean) as Record<string, unknown>[] : [];
      const uniquePools = new Map<string, Record<string, unknown>>();
      for (const pool of pools) {
        const key = typeof pool.addr === "string" ? pool.addr : JSON.stringify(pool);
        if (!uniquePools.has(key)) uniquePools.set(key, pool);
      }
      const poolLiquidity = [...uniquePools.values()].reduce((sum, pool) => sum + (finite(pool.liqUsd) ?? 0), 0);
      const poolVolume = [...uniquePools.values()].reduce((sum, pool) => sum + (finite(pool.v24) ?? 0), 0);
      const liquidityUsd = poolLiquidity > 0 ? poolLiquidity : detailLiquidity;
      const volume24hUsd = poolVolume > 0 ? poolVolume : detailVolume;

      if ([priceUsd, marketCapUsd, fdvUsd, liquidityUsd, volume24hUsd, priceChange24hPercent, holderCountRaw].every((value) => value === null)) return null;
      const timestamp = finite(payload.pt);
      return {
        priceUsd,
        marketCapUsd,
        fdvUsd,
        liquidityUsd,
        volume24hUsd,
        priceChange24hPercent,
        holderCount: holderCountRaw !== null && holderCountRaw >= 0 ? Math.trunc(holderCountRaw) : null,
        priceConfidenceUsd: null,
        pricePublishTime: null,
        source: "coinmarketcap",
        observedAt: timestamp !== null ? new Date(timestamp > 10_000_000_000 ? timestamp : timestamp * 1_000).toISOString() : new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AppError("SERVICE_UNAVAILABLE", "CoinMarketCap market request timed out.", 503, { retryable: true });
      }
      throw new AppError("SERVICE_UNAVAILABLE", error instanceof Error ? error.message : "CoinMarketCap market request failed.", 503, { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }
}
