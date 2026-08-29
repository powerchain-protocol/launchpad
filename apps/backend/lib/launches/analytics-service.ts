import {
  normalizeLaunchAnalytics,
  type ChainLaunchAnalyticsInput,
  type NormalizedLaunchAnalytics,
} from "@powerchain/launchpad-domain/launch";
import type { LaunchRepository } from "./repository";

export interface LaunchAnalyticsReader {
  read(launchId: string, chain: "solana" | "sui"): Promise<ChainLaunchAnalyticsInput>;
}

export class CrossChainLaunchAnalyticsService {
  constructor(
    private readonly repository: LaunchRepository,
    private readonly readers: Record<"solana" | "sui", LaunchAnalyticsReader>,
  ) {}

  async list(filters?: { chain?: "solana" | "sui"; status?: string }): Promise<NormalizedLaunchAnalytics[]> {
    const launches = await this.repository.listForAnalytics(filters);
    return Promise.all(
      launches.map(async (launch) => {
        const raw = await this.readers[launch.chain].read(launch.id, launch.chain);
        return normalizeLaunchAnalytics(raw);
      }),
    );
  }
}
