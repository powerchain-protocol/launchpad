import { config } from "@/lib/config";
import { getClaimAllocation, getSale } from "@/lib/server/store";
import { isConfiguredAddress } from "@/lib/server/validation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const buyer = String(body.buyer || "");
  if (!isConfiguredAddress(buyer)) return Response.json({ error: "INVALID_WALLET" }, { status: 400 });
  const sale = await getSale(id);
  if (!sale) return Response.json({ error: "SALE_NOT_FOUND" }, { status: 404 });
  const allocation = await getClaimAllocation(id, buyer);
  const available = BigInt(allocation?.purchased || "0") - BigInt(allocation?.claimed || "0");
  if (Date.now() < Date.parse(sale.claimAt) || (sale.stage !== "CLAIMING" && sale.stage !== "COMPLETED")) return Response.json({ error: "CLAIM_WINDOW_NOT_OPEN" }, { status: 409 });
  if (available <= 0n) return Response.json({ error: "NOTHING_TO_CLAIM" }, { status: 409 });
  if (!isConfiguredAddress(config.claimProgramId)) {
    return Response.json({ error: "CLAIM_PROGRAM_NOT_CONFIGURED", available: available.toString(), failClosed: true }, { status: 503 });
  }
  return Response.json({ error: "CLAIM_PROGRAM_ADAPTER_REQUIRES_DEPLOYED_IDL_AND_VAULT_CONFIGURATION", failClosed: true }, { status: 501 });
}
