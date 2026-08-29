import { loadRuntimeConfig } from "@powerchain/launchpad-config";
import { AppError } from "@powerchain/launchpad-shared";
import { HttpSuiMarketDataProvider } from "./market-provider";
import { SuiReadService } from "./service";

let service: SuiReadService | undefined;

export function configureSuiReadService(next: SuiReadService): void { service = next; }

export function getSuiReadService(): SuiReadService {
  if (service) return service;
  const config = loadRuntimeConfig();
  if (!config.sui.grpcUrls.length) throw new AppError("SERVICE_UNAVAILABLE", "Sui gRPC is not configured.", 503);
  const marketProvider = config.suiMarket.url
    ? new HttpSuiMarketDataProvider({
        url: config.suiMarket.url,
        ...(config.suiMarket.bearerToken ? { bearerToken: config.suiMarket.bearerToken } : {}),
        timeoutMs: config.suiMarket.timeoutMs,
      })
    : undefined;
  service = new SuiReadService(config.sui.network, config.sui.grpcUrls, marketProvider);
  return service;
}

export function resetSuiReadServiceForTests(): void { service = undefined; }
