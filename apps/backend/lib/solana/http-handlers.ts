import { loadRuntimeConfig } from "@powerchain/launchpad-config";
import { AppError } from "@powerchain/launchpad-shared";
import { apiResponse, handleApi, handleOptions } from "@/lib/http/handler";
import { getSolanaReadService } from "./container";

export const OPTIONS = handleOptions;
const READ_LIMIT = { rateLimit: { limit: 120, windowSeconds: 60 } } as const;
const MARKET_LIMIT = { rateLimit: { limit: 60, windowSeconds: 60 } } as const;

export async function rpcHealthGET(request: Request) {
  return handleApi(request, async () => getSolanaReadService().rpcHealth(), READ_LIMIT);
}

export async function solanaOverviewGET(request: Request) {
  return handleApi(request, async () => getSolanaReadService().overview(), READ_LIMIT);
}

export async function programsVerifyGET(request: Request) {
  return handleApi(request, async () => getSolanaReadService().programs(), READ_LIMIT);
}

export async function tokenMintGET(request: Request, context: { params: Promise<{ mint: string }> }) {
  return handleApi(request, async () => {
    const { mint } = await context.params;
    return getSolanaReadService().asset(mint);
  }, READ_LIMIT);
}

export async function tokenMarketGET(request: Request) {
  return handleApi(request, async ({ request }) => {
    const mint = new URL(request.url).searchParams.get("mint")?.trim();
    if (!mint) throw new AppError("BAD_REQUEST", "mint query parameter is required.", 400);
    return getSolanaReadService().market(mint);
  }, MARKET_LIMIT);
}

export async function compatSolanaOverviewGET(request: Request) {
  return handleApi(request, async () => apiResponse(
    await getSolanaReadService().overview(),
    200,
    { "X-PowerChain-Canonical-Endpoint": "/api/v1/solana/overview" },
  ), READ_LIMIT);
}

export async function compatTokenMarketGET(request: Request) {
  return handleApi(request, async ({ request }) => {
    const requested = new URL(request.url).searchParams.get("mint")?.trim();
    const mint = requested || loadRuntimeConfig().solana.pwrcMint;
    if (!mint) throw new AppError("BAD_REQUEST", "mint query parameter is required when PWRC_MINT is not configured.", 400);
    return apiResponse(
      await getSolanaReadService().market(mint),
      200,
      { "X-PowerChain-Canonical-Endpoint": "/api/v1/token/market" },
    );
  }, MARKET_LIMIT);
}

export async function compatMintGET(request: Request, context: { params: Promise<{ mint: string }> }) {
  return handleApi(request, async () => {
    const { mint } = await context.params;
    return apiResponse(
      await getSolanaReadService().asset(mint),
      200,
      { "X-PowerChain-Canonical-Endpoint": `/api/v1/token/mint/${encodeURIComponent(mint)}` },
    );
  }, READ_LIMIT);
}
