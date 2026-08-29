import { AppError } from "@powerchain/launchpad-shared";
import { handleApi, handleOptions } from "@/lib/http/handler";
import { getPowerPayReadService } from "./container";

export const OPTIONS = handleOptions;
const READ_LIMIT = { rateLimit: { limit: 120, windowSeconds: 60 } } as const;
const MARKET_LIMIT = { rateLimit: { limit: 60, windowSeconds: 60 } } as const;

export async function powerPayOverviewGET(request: Request) {
  return handleApi(request, async ({ request }) => {
    const mint = new URL(request.url).searchParams.get("mint")?.trim();
    return getPowerPayReadService().overview(mint);
  }, READ_LIMIT);
}

export async function powerPayRpcGET(request: Request) {
  return handleApi(request, async () => getPowerPayReadService().rpc(), READ_LIMIT);
}

export async function powerPayProgramsGET(request: Request) {
  return handleApi(request, async () => getPowerPayReadService().programs(), READ_LIMIT);
}

export async function powerPayMarketGET(request: Request) {
  return handleApi(request, async ({ request }) => {
    const mint = new URL(request.url).searchParams.get("mint")?.trim();
    return getPowerPayReadService().market(mint);
  }, MARKET_LIMIT);
}

export async function powerPayMintGET(request: Request, context: { params: Promise<{ mint: string }> }) {
  return handleApi(request, async () => {
    const { mint } = await context.params;
    if (!mint.trim()) throw new AppError("BAD_REQUEST", "mint is required.", 400);
    return getPowerPayReadService().mint(mint);
  }, READ_LIMIT);
}
