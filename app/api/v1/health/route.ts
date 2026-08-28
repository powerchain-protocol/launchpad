import { config } from "@/lib/config";
import { isConfiguredAddress } from "@/lib/server/validation";
import { getPoolAdapterCapability } from "@/lib/solana/pools/registry";
import type { PoolVenue } from "@/types/domain";

export const dynamic = "force-dynamic";

export async function GET() {
  const venues: PoolVenue[] = ["RAYDIUM_CPMM", "METEORA_DAMM_V2", "ORCA_WHIRLPOOL"];
  const adapterCapabilities = Object.fromEntries(venues.map((venue) => {
    const capability = getPoolAdapterCapability(venue);
    return [venue, {
      configured: Boolean(capability.configuredVersion),
      version: capability.configuredVersion,
      implementationAvailable: capability.implementationAvailable,
    }];
  }));

  const configured = {
    pwrcMint: isConfiguredAddress(config.pwrcMint),
    usdcMint: isConfiguredAddress(config.usdcMint),
    feeTreasury: isConfiguredAddress(config.feeTreasury),
    merchantWallet: isConfiguredAddress(config.merchantWallet),
    saleAuthority: isConfiguredAddress(config.saleAuthority),
    tokenSaleProgram: isConfiguredAddress(config.tokenSaleProgramId),
    factoryProgram: isConfiguredAddress(config.factoryProgramId),
    claimProgram: isConfiguredAddress(config.claimProgramId),
    adminWallets: config.adminWallets.length > 0,
    configuredPoolAdapters: Object.values(config.poolAdapters).filter(Boolean).length,
    implementedPoolAdapters: Object.values(adapterCapabilities).filter((item) => item.implementationAvailable).length,
  };

  const liveSettlementReady = config.serviceFeeBps === 200 && configured.feeTreasury && configured.merchantWallet && configured.saleAuthority && configured.adminWallets;
  const poolExecutionReady = configured.implementedPoolAdapters > 0;

  return Response.json({
    ok: true,
    service: "powerchain-launchpad",
    version: "1.3.0",
    cluster: config.cluster,
    liveSettlementReady,
    poolExecutionReady,
    configured,
    adapterCapabilities,
    time: new Date().toISOString(),
  }, { headers: { "cache-control": "no-store" } });
}
