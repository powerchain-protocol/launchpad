import { AppError } from "@powerchain/launchpad-shared";
import { apiResponse, handleApi, handleOptions } from "@/lib/http/handler";
import { getSuiReadService } from "./container";

export const OPTIONS = handleOptions;
const READ_LIMIT = { rateLimit: { limit: 120, windowSeconds: 60 } } as const;
const MARKET_LIMIT = { rateLimit: { limit: 60, windowSeconds: 60 } } as const;

export async function suiOverviewGET(request: Request) {
  return handleApi(request, async () => getSuiReadService().overview(), READ_LIMIT);
}

export async function suiPackagesGET(request: Request) {
  return handleApi(request, async () => getSuiReadService().packages(), READ_LIMIT);
}

export async function suiMarketGET(request: Request) {
  return handleApi(request, async ({ request }) => {
    const coinType = new URL(request.url).searchParams.get("coinType")?.trim();
    if (!coinType) throw new AppError("BAD_REQUEST", "coinType query parameter is required.", 400);
    return getSuiReadService().market(coinType);
  }, MARKET_LIMIT);
}

export async function suiAssetGET(request: Request, context: { params: Promise<{ coinType: string }> }) {
  return handleApi(request, async () => {
    const { coinType } = await context.params;
    if (!coinType.trim()) throw new AppError("BAD_REQUEST", "coinType is required.", 400);
    return getSuiReadService().asset(decodeURIComponent(coinType));
  }, READ_LIMIT);
}

export async function compatSuiOverviewGET(request: Request) {
  return handleApi(request, async () => apiResponse(
    await getSuiReadService().overview(), 200, { "X-PowerChain-Canonical-Endpoint": "/api/v1/sui/overview" },
  ), READ_LIMIT);
}

export async function compatSuiPackagesGET(request: Request) {
  return handleApi(request, async () => apiResponse(
    await getSuiReadService().packages(), 200, { "X-PowerChain-Canonical-Endpoint": "/api/v1/sui/packages" },
  ), READ_LIMIT);
}

export async function compatSuiMarketGET(request: Request) {
  return handleApi(request, async ({ request }) => {
    const coinType = new URL(request.url).searchParams.get("coinType")?.trim();
    if (!coinType) throw new AppError("BAD_REQUEST", "coinType query parameter is required.", 400);
    return apiResponse(
      await getSuiReadService().market(coinType), 200, { "X-PowerChain-Canonical-Endpoint": "/api/v1/sui/market" },
    );
  }, MARKET_LIMIT);
}

export async function compatSuiAssetGET(request: Request, context: { params: Promise<{ coinType: string }> }) {
  return handleApi(request, async () => {
    const { coinType } = await context.params;
    const decoded = decodeURIComponent(coinType);
    return apiResponse(
      await getSuiReadService().asset(decoded), 200,
      { "X-PowerChain-Canonical-Endpoint": `/api/v1/sui/assets/${encodeURIComponent(decoded)}` },
    );
  }, READ_LIMIT);
}
