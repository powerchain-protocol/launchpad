import { loadRuntimeConfig } from "@powerchain/launchpad-config";
import { AppError } from "@powerchain/launchpad-shared";
import { HttpSolanaMarketDataProvider } from "./market-provider";
import { PythMarketDataProvider } from "./pyth-market-provider";
import { CoinGeckoMarketDataProvider } from "./coingecko-market-provider";
import { CoinMarketCapMarketDataProvider } from "./coinmarketcap-market-provider";
import { SolanaMarketResolver } from "./market-resolver";
import { SolanaReadService } from "./service";
import type { SolanaMarketDataProvider } from "./types";

let service: SolanaReadService | undefined;

export function configureSolanaReadService(next: SolanaReadService): void {
  service = next;
}

function configuredMarketProviders(): SolanaMarketDataProvider[] {
  const config = loadRuntimeConfig();
  const providers: SolanaMarketDataProvider[] = [];
  const enabled = new Set(config.solanaMarket.providers.map((value) => value.toLowerCase()));

  if (enabled.has("pyth") && Object.keys(config.solanaMarket.pyth.feedIdsByMint).length) {
    providers.push(new PythMarketDataProvider({
      baseUrl: config.solanaMarket.pyth.baseUrl,
      ...(config.solanaMarket.pyth.apiKey ? { apiKey: config.solanaMarket.pyth.apiKey } : {}),
      feedIdsByMint: config.solanaMarket.pyth.feedIdsByMint,
      timeoutMs: config.solanaMarket.timeoutMs,
    }));
  }

  if (enabled.has("coingecko") && config.solanaMarket.coinGecko.apiKey) {
    providers.push(new CoinGeckoMarketDataProvider({
      baseUrl: config.solanaMarket.coinGecko.baseUrl,
      ...(config.solanaMarket.coinGecko.apiKey ? { apiKey: config.solanaMarket.coinGecko.apiKey } : {}),
      apiKeyHeader: config.solanaMarket.coinGecko.apiKeyHeader,
      timeoutMs: config.solanaMarket.timeoutMs,
    }));
  }

  if (enabled.has("coinmarketcap")) {
    providers.push(new CoinMarketCapMarketDataProvider({
      baseUrl: config.solanaMarket.coinMarketCap.baseUrl,
      ...(config.solanaMarket.coinMarketCap.apiKey ? { apiKey: config.solanaMarket.coinMarketCap.apiKey } : {}),
      timeoutMs: config.solanaMarket.timeoutMs,
    }));
  }

  if (config.solanaMarket.url) {
    providers.push(new HttpSolanaMarketDataProvider({
      url: config.solanaMarket.url,
      ...(config.solanaMarket.bearerToken ? { bearerToken: config.solanaMarket.bearerToken } : {}),
      timeoutMs: config.solanaMarket.timeoutMs,
    }));
  }

  return providers;
}

export function getSolanaReadService(): SolanaReadService {
  if (service) return service;
  const config = loadRuntimeConfig();
  if (!config.solana.rpcUrls.length) {
    throw new AppError("SERVICE_UNAVAILABLE", "Solana RPC is not configured.", 503);
  }
  const providers = configuredMarketProviders();
  const marketProvider = providers.length ? new SolanaMarketResolver(providers) : undefined;
  service = new SolanaReadService(config.solana.rpcUrls, marketProvider);
  return service;
}

export function resetSolanaReadServiceForTests(): void {
  service = undefined;
}
