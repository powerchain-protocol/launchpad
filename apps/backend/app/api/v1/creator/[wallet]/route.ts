import { handleApi, handleOptions } from "@/lib/http/handler";
import { getSolanaReadService } from "@/lib/solana/container";

export async function GET(request: Request, context: { params: Promise<{ wallet: string }> }) {
  return handleApi(request, async () => {
    const { wallet } = await context.params;
    return getSolanaReadService().creator(wallet);
  }, { rateLimit: { limit: 60, windowSeconds: 60 } });
}
export function OPTIONS(request: Request) { return handleOptions(request); }
