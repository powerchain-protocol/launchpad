import type {
  SolanaExternalMarketData,
  SolanaMarketDataProvider,
  SolanaMarketProviderObservation,
  SolanaResolvedMarketData,
} from "./types";

const FIELDS = [
  "priceUsd",
  "marketCapUsd",
  "fdvUsd",
  "liquidityUsd",
  "volume24hUsd",
  "priceChange24hPercent",
  "holderCount",
  "priceConfidenceUsd",
  "pricePublishTime",
] as const;

type MarketField = (typeof FIELDS)[number];
type ResolvedFields = Pick<SolanaExternalMarketData, MarketField>;

export class SolanaMarketResolver implements SolanaMarketDataProvider {
  readonly id = "resolver";

  constructor(private readonly providers: readonly SolanaMarketDataProvider[]) {}

  async getMarket(mint: string): Promise<SolanaResolvedMarketData | null> {
    if (!this.providers.length) return null;

    const observations: SolanaMarketProviderObservation[] = [];
    const sources: string[] = [];
    const resolved: ResolvedFields = {
      priceUsd: null,
      marketCapUsd: null,
      fdvUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      priceChange24hPercent: null,
      holderCount: null,
      priceConfidenceUsd: null,
      pricePublishTime: null,
    };
    let observedAt = new Date(0).toISOString();

    for (const provider of this.providers) {
      const providerId = provider.id ?? provider.constructor.name;
      try {
        const value = await provider.getMarket(mint);
        if (!value) {
          observations.push({ source: providerId, available: false, contributed: [] });
          continue;
        }
        const contributed: string[] = [];
        for (const field of FIELDS) {
          if (resolved[field] === null && value[field] !== null) {
            (resolved as Record<MarketField, number | string | null>)[field] = value[field];
            contributed.push(field);
          }
        }
        if (contributed.length && !sources.includes(value.source)) sources.push(value.source);
        if (Date.parse(value.observedAt) > Date.parse(observedAt)) observedAt = value.observedAt;
        observations.push({
          source: value.source || providerId,
          available: true,
          contributed,
          observedAt: value.observedAt,
        });
      } catch (error) {
        observations.push({
          source: providerId,
          available: false,
          contributed: [],
          error: error instanceof Error ? error.message : "Market provider failed.",
        });
      }
    }

    const available = FIELDS.some((field) => resolved[field] !== null);
    if (!available) {
      const errors = observations.filter((item) => item.error).map((item) => `${item.source}: ${item.error}`);
      if (errors.length) throw new Error(errors.join(" | "));
      return null;
    }

    return {
      ...resolved,
      source: sources.join("+") || "market-resolver",
      sources,
      observations,
      observedAt: observedAt === new Date(0).toISOString() ? new Date().toISOString() : observedAt,
    } satisfies SolanaResolvedMarketData;
  }
}

export function isResolvedMarketData(value: SolanaExternalMarketData): value is SolanaResolvedMarketData {
  return "sources" in value && Array.isArray((value as Partial<SolanaResolvedMarketData>).sources);
}
