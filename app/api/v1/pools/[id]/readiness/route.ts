import { buildPoolExecutionReadiness, buildPoolReview, saleGraduationProgressBps } from "@/lib/server/pools";
import { getPool, getSale } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = await getPool(id);
  if (!pool) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const sale = pool.saleId ? await getSale(pool.saleId) : null;
  return Response.json({
    poolId: pool.id,
    review: buildPoolReview(pool, sale),
    execution: buildPoolExecutionReadiness(pool, sale),
    graduation: saleGraduationProgressBps(pool, sale),
  }, { headers: { "cache-control": "no-store" } });
}
