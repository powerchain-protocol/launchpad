import { consumeSignedChallenge } from "@/lib/server/auth";
import { buildPoolReview } from "@/lib/server/pools";
import { addAudit, getPool, getSale, updatePool } from "@/lib/server/store";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = await getPool(id);
  if (!pool) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const sale = pool.saleId ? await getSale(pool.saleId) : null;
  return Response.json({ review: buildPoolReview(pool, sale) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const expectedRevision = Number(body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error("EXPECTED_POOL_REVISION_REQUIRED");
    await consumeSignedChallenge({
      challengeId: String(body.challengeId || ""),
      address: String(body.address || ""),
      purpose: `admin:pool:${id}:review`,
      signature: String(body.signature || ""),
      admin: true,
    });

    const pool = await getPool(id);
    if (!pool) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    const sale = pool.saleId ? await getSale(pool.saleId) : null;
    const review = buildPoolReview(pool, sale);
    if (!review.configurationValid) {
      throw new Error(`POOL_CONFIGURATION_BLOCKED:${review.configurationBlockers.join(",")}`);
    }
    if (!review.adapterVersion) throw new Error("VENUE_ADAPTER_NOT_CONFIGURED");

    const reviewedAt = new Date().toISOString();
    const updated = await updatePool(id, {
      reviewHash: review.reviewHash,
      reviewedAt,
      reviewAdapterVersion: review.adapterVersion,
      reviewedBy: String(body.address),
      reviewConfigurationRevision: pool.configurationRevision,
    }, { expectedRevision, configurationChanged: false });
    if (!updated) throw new Error("POOL_NOT_FOUND");
    const approved = buildPoolReview(updated, sale);
    await addAudit(String(body.address), "pool.review.approve", id, {
      reviewHash: approved.reviewHash,
      adapterVersion: approved.adapterVersion,
      ready: approved.ready,
      configurationRevision: updated.configurationRevision,
      recordRevision: updated.revision,
    });
    return Response.json({ pool: updated, review: approved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "POOL_REVIEW_FAILED";
    const unauthorized = message.includes("CHALLENGE") || message.includes("SIGNATURE") || message.includes("ADMIN");
    const conflict = message.includes("REVISION_CONFLICT");
    return Response.json({ error: message }, { status: unauthorized ? 401 : conflict ? 409 : 400 });
  }
}
