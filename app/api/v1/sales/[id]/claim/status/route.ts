import { getClaimAllocation, getSale } from "@/lib/server/store";
import { isConfiguredAddress } from "@/lib/server/validation";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wallet = new URL(req.url).searchParams.get("wallet") || "";
  if (!isConfiguredAddress(wallet)) return Response.json({ error: "INVALID_WALLET" }, { status: 400 });
  const sale = await getSale(id);
  if (!sale) return Response.json({ error: "SALE_NOT_FOUND" }, { status: 404 });
  const allocation = await getClaimAllocation(id, wallet);
  const purchased = BigInt(allocation?.purchased || "0");
  const claimed = BigInt(allocation?.claimed || "0");
  const claimOpen = Date.now() >= Date.parse(sale.claimAt) && (sale.stage === "CLAIMING" || sale.stage === "COMPLETED");
  const vested = claimOpen ? purchased : 0n;
  const available = vested > claimed ? vested - claimed : 0n;
  return Response.json({ saleId: id, wallet, purchased: purchased.toString(), vested: vested.toString(), claimed: claimed.toString(), available: available.toString(), claimOpen, claimAt: sale.claimAt });
}
