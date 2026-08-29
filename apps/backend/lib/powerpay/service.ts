import { loadRuntimeConfig } from "@powerchain/launchpad-config";
import { AppError } from "@powerchain/launchpad-shared";
import type { SolanaAssetResponse, SolanaMarketResponse } from "../solana/types";
import { SolanaReadService } from "../solana/service";
import type { PowerPayOverviewResponse, PowerPayProgramsResponse } from "./types";

export class PowerPayReadService {
  constructor(private readonly solana: SolanaReadService) {}

  async programs(): Promise<PowerPayProgramsResponse> {
    const response = await this.solana.programs();
    const programs = response.programs.filter((program) => program.category === "powerpay" || program.kind === "token-2022");
    const powerPayOnly = programs.filter((program) => program.category === "powerpay");
    return {
      chain: "solana",
      network: response.network,
      configured: powerPayOnly.length > 0 && powerPayOnly.every((program) => program.configured),
      verified: response.powerPayVerified,
      programs,
      observedAt: response.observedAt,
    };
  }

  rpc() { return this.solana.rpcHealth(); }

  mint(mint: string) { return this.solana.asset(mint); }

  market(mint?: string): Promise<SolanaMarketResponse> {
    const config = loadRuntimeConfig();
    const resolved = mint?.trim() || config.solana.pwrcMint;
    if (!resolved) throw new AppError("BAD_REQUEST", "mint is required when PWRC_MINT is not configured.", 400);
    return this.solana.market(resolved);
  }

  async overview(mint?: string): Promise<PowerPayOverviewResponse> {
    const config = loadRuntimeConfig();
    const resolvedMint = mint?.trim() || config.solana.pwrcMint;
    const [rpc, programs] = await Promise.all([this.rpc(), this.programs()]);
    let asset: SolanaAssetResponse | null = null;
    let market: SolanaMarketResponse | null = null;
    if (resolvedMint) {
      asset = await this.mint(resolvedMint);
      try { market = await this.market(resolvedMint); }
      catch { market = null; }
    }
    return {
      product: "PowerPay",
      chain: "solana",
      network: config.solana.network,
      mode: config.mode,
      rpc,
      programs,
      checkout: {
        solEnabled: Boolean(config.solana.rpcUrls.length && config.solana.treasury && config.solana.serviceFeeRecipient),
        usdcEnabled: Boolean(config.solana.rpcUrls.length && config.solana.usdcMint && config.solana.treasury && config.solana.serviceFeeRecipient),
        pwrcReceiveConfigured: Boolean(config.solana.pwrcMint),
        treasury: config.solana.treasury ?? null,
        serviceFeeRecipient: config.solana.serviceFeeRecipient ?? null,
        serviceFeeBps: config.checkout.serviceFeeBps,
      },
      mint: asset,
      market,
      observedAt: new Date().toISOString(),
    };
  }
}
