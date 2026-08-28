import { consumeSignedChallenge } from "@/lib/server/auth";
import { buildPoolExecutionReadiness, buildPoolReview } from "@/lib/server/pools";
import { addAudit, listAudit, listPools, listSales, listTx } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    await consumeSignedChallenge({
      challengeId: String(body.challengeId || ""),
      address: String(body.address || ""),
      purpose: "admin:summary:read",
      signature: String(body.signature || ""),
      admin: true,
    });

    const transactions = (await listTx()).filter((item) => item.status === "VALIDATED");
    const sales = await listSales();
    const pools = await listPools();
    const saleById = new Map(sales.map((sale) => [sale.id, sale]));
    const poolStates = pools.map((pool) => {
      const sale = pool.saleId ? saleById.get(pool.saleId) || null : null;
      return { pool, review: buildPoolReview(pool, sale), execution: buildPoolExecutionReadiness(pool, sale) };
    });

    await addAudit(String(body.address), "admin.summary.read");
    const audit = await listAudit(30);

    return Response.json({
      counts: {
        transactions: transactions.length,
        payments: transactions.filter((item) => item.kind === "PAYMENT").length,
        purchases: transactions.filter((item) => item.kind === "TOKEN_PURCHASE").length,
        claims: transactions.filter((item) => item.kind === "CLAIM").length,
        sends: transactions.filter((item) => item.kind === "SEND").length,
        validatedSales: sales.filter((sale) => sale.validated).length,
        pools: pools.length,
        reviewApprovedPools: poolStates.filter(({ review }) => review.reviewCurrent).length,
        executionEligiblePools: poolStates.filter(({ execution }) => execution.executable).length,
        livePools: pools.filter((pool) => pool.status === "LIVE" || pool.status === "GRADUATED").length,
      },
      transactions,
      audit,
      generatedAt: new Date().toISOString(),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "UNAUTHORIZED" }, { status: 401 });
  }
}
