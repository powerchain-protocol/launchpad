import { handleApi, handleOptions } from "@/lib/http/handler";

export async function GET(request: Request) {
  return handleApi(request, async ({ requestId }) => ({
    ok: true,
    service: "powerchain-launchpad-backend",
    version: "1.0.0",
    requestId,
  }));
}

export function OPTIONS(request: Request) { return handleOptions(request); }
