import { consumeSignedChallenge } from "@/lib/server/auth";
import { addAudit, getPool, getSale, updatePool } from "@/lib/server/store";
import { buildPoolExecutionReadiness, buildPoolReview, poolVenues, validateDecimals, validatePoolAmount, validatePoolBps } from "@/lib/server/pools";
import { isConfiguredAddress } from "@/lib/server/validation";
import type { LaunchPool, PoolStatus } from "@/types/domain";
export const dynamic = "force-dynamic";

const editableStatuses: PoolStatus[] = ["DRAFT", "SCHEDULED", "READY", "FAILED"];
const editableTransitions: Record<"DRAFT" | "SCHEDULED" | "READY" | "FAILED", PoolStatus[]> = {
  DRAFT: ["SCHEDULED", "READY", "FAILED"],
  SCHEDULED: ["DRAFT", "READY", "FAILED"],
  READY: ["DRAFT", "SCHEDULED", "FAILED"],
  FAILED: ["DRAFT"],
};
const immutableAfterCreation = new Set(["mode", "baseMint", "baseSymbol", "baseDecimals", "quoteMint", "quoteSymbol", "quoteDecimals", "venue", "authority", "treasuryWallet", "initialBaseAmount", "initialQuoteAmount", "saleId", "feeTierBps", "launchAt", "graduationThresholdBps"]);
const reviewBoundFields = new Set(["mode", "saleId", "baseMint", "baseSymbol", "baseDecimals", "quoteMint", "quoteSymbol", "quoteDecimals", "venue", "authority", "treasuryWallet", "initialBaseAmount", "initialQuoteAmount", "feeTierBps", "launchAt", "graduationThresholdBps"]);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = await getPool(id);
  if (!pool) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const sale = pool.saleId ? await getSale(pool.saleId) : null;
  return Response.json({ pool, review: buildPoolReview(pool, sale), execution: buildPoolExecutionReadiness(pool, sale) }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await getPool(id);
    if (!existing) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    const body = await req.json();
    await consumeSignedChallenge({
      challengeId: String(body.challengeId || ""),
      address: String(body.address || ""),
      purpose: `admin:pool:${id}:update`,
      signature: String(body.signature || ""),
      admin: true,
    });
    const patch = body.patch || {};
    const expectedRevision = Number(body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error("EXPECTED_POOL_REVISION_REQUIRED");
    const reconciledState = ["CREATING", "LIVE", "GRADUATED", "CLOSED"].includes(existing.status);
    if (reconciledState) {
      for (const key of Object.keys(patch)) if (immutableAfterCreation.has(key)) throw new Error("ONCHAIN_POOL_CONFIGURATION_IMMUTABLE");
      if (patch.status !== undefined && patch.status !== existing.status) throw new Error("POOL_STATUS_REQUIRES_RECONCILIATION");
    }
    if (patch.status !== undefined && !reconciledState) {
      const nextStatus = String(patch.status) as PoolStatus;
      if (!editableStatuses.includes(nextStatus)) throw new Error("POOL_STATUS_REQUIRES_RECONCILIATION");
      if (nextStatus !== existing.status && editableStatuses.includes(existing.status) && !editableTransitions[existing.status as keyof typeof editableTransitions].includes(nextStatus)) throw new Error(`INVALID_POOL_STATUS_TRANSITION:${existing.status}_TO_${nextStatus}`);
    }
    if (patch.mode !== undefined && !["SALE_GRADUATION", "MANUAL"].includes(String(patch.mode))) throw new Error("INVALID_POOL_MODE");
    if (patch.venue !== undefined && !poolVenues.includes(String(patch.venue) as LaunchPool["venue"])) throw new Error("UNSUPPORTED_POOL_VENUE");
    if (patch.baseMint !== undefined && !isConfiguredAddress(String(patch.baseMint))) throw new Error("BASE_MINT_INVALID");
    if (patch.quoteMint !== undefined && !isConfiguredAddress(String(patch.quoteMint))) throw new Error("QUOTE_MINT_INVALID");
    if (patch.authority !== undefined && !isConfiguredAddress(String(patch.authority))) throw new Error("AUTHORITY_INVALID");
    if (patch.treasuryWallet !== undefined && !isConfiguredAddress(String(patch.treasuryWallet))) throw new Error("TREASURY_WALLET_INVALID");
    if ((patch.baseMint ?? existing.baseMint) === (patch.quoteMint ?? existing.quoteMint)) throw new Error("POOL_MINTS_MUST_DIFFER");
    if (patch.saleId && !(await getSale(String(patch.saleId)))) throw new Error("SALE_NOT_FOUND");

    const allowed: Partial<LaunchPool> = {
      name: patch.name === undefined ? undefined : String(patch.name).slice(0, 80),
      mode: patch.mode,
      saleId: patch.saleId,
      baseMint: patch.baseMint,
      baseSymbol: patch.baseSymbol === undefined ? undefined : String(patch.baseSymbol).toUpperCase().slice(0, 12),
      baseDecimals: patch.baseDecimals === undefined ? undefined : validateDecimals(patch.baseDecimals, "BASE_DECIMALS"),
      quoteMint: patch.quoteMint,
      quoteSymbol: patch.quoteSymbol === undefined ? undefined : String(patch.quoteSymbol).toUpperCase().slice(0, 12),
      quoteDecimals: patch.quoteDecimals === undefined ? undefined : validateDecimals(patch.quoteDecimals, "QUOTE_DECIMALS"),
      venue: patch.venue,
      status: patch.status,
      authority: patch.authority,
      treasuryWallet: patch.treasuryWallet,
      initialBaseAmount: patch.initialBaseAmount === undefined ? undefined : validatePoolAmount(patch.initialBaseAmount, "INITIAL_BASE_AMOUNT", true),
      initialQuoteAmount: patch.initialQuoteAmount === undefined ? undefined : validatePoolAmount(patch.initialQuoteAmount, "INITIAL_QUOTE_AMOUNT", true),
      feeTierBps: patch.feeTierBps === undefined ? undefined : patch.feeTierBps === "" || patch.feeTierBps === null ? undefined : validatePoolBps(patch.feeTierBps, "FEE_TIER_BPS", { allowZero: true }),
      launchAt: patch.launchAt === undefined ? undefined : patch.launchAt ? new Date(String(patch.launchAt)).toISOString() : undefined,
      graduationThresholdBps: patch.graduationThresholdBps === undefined ? undefined : validatePoolBps(patch.graduationThresholdBps, "GRADUATION_THRESHOLD_BPS"),
      validated: patch.validated === undefined ? undefined : Boolean(patch.validated),
    };
    Object.keys(allowed).forEach((key) => { if ((allowed as Record<string, unknown>)[key] !== undefined) return; if (key === "feeTierBps" && Object.prototype.hasOwnProperty.call(patch, "feeTierBps")) return; delete (allowed as Record<string, unknown>)[key]; });
    const candidate = { ...existing, ...allowed, id } as LaunchPool;
    const candidateReview = buildPoolReview(candidate, candidate.saleId ? await getSale(candidate.saleId) : null);
    if (patch.status === "SCHEDULED") {
      if (!candidate.launchAt || Date.parse(candidate.launchAt) <= Date.now()) throw new Error("SCHEDULED_POOL_REQUIRES_FUTURE_LAUNCH_TIME");
    }
    if (patch.status === "READY" && !candidateReview.ready) throw new Error(`POOL_NOT_READY:${candidateReview.blockers.join(",")}`);
    const configurationChanged = Object.keys(allowed).some((key) => reviewBoundFields.has(key) && (allowed as Record<string, unknown>)[key] !== (existing as unknown as Record<string, unknown>)[key]);
    const pool = await updatePool(id, allowed, { expectedRevision, configurationChanged });
    if (!pool) throw new Error("POOL_NOT_FOUND");
    const review = buildPoolReview(pool, pool.saleId ? await getSale(pool.saleId) : null);
    await addAudit(String(body.address), "pool.update", id, { status: pool.status, validated: pool.validated, reviewHash: review.reviewHash, revision: pool.revision, configurationRevision: pool.configurationRevision });
    return Response.json({ pool, review });
  } catch (error) {
    const message = error instanceof Error ? error.message : "POOL_UPDATE_FAILED";
    const unauthorized = message.includes("CHALLENGE") || message.includes("SIGNATURE") || message.includes("ADMIN");
    const conflict = message.includes("REVISION_CONFLICT");
    return Response.json({ error: message }, { status: unauthorized ? 401 : conflict ? 409 : 400 });
  }
}
