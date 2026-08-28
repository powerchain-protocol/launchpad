import crypto from "node:crypto";
import { consumeSignedChallenge } from "@/lib/server/auth";
import { addAudit, createPool, getSale, listPools } from "@/lib/server/store";
import { buildPoolExecutionReadiness, buildPoolReview, poolVenues, validateDecimals, validatePoolAmount, validatePoolBps } from "@/lib/server/pools";
import { isConfiguredAddress } from "@/lib/server/validation";
import type { LaunchPool, PoolMode } from "@/types/domain";
export const dynamic = "force-dynamic";

export async function GET() {
  const pools = await listPools();
  const rows = await Promise.all(pools.map(async (pool) => {
    const sale = pool.saleId ? await getSale(pool.saleId) : null;
    return { pool, review: buildPoolReview(pool, sale), execution: buildPoolExecutionReadiness(pool, sale) };
  }));
  return Response.json({ pools: rows });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    await consumeSignedChallenge({
      challengeId: String(body.challengeId || ""),
      address: String(body.address || ""),
      purpose: "admin:pools:create",
      signature: String(body.signature || ""),
      admin: true,
    });
    const input = body.pool || {};
    const venue = String(input.venue || "RAYDIUM_CPMM") as LaunchPool["venue"];
    const mode = String(input.mode || "MANUAL") as PoolMode;
    if (!poolVenues.includes(venue)) throw new Error("UNSUPPORTED_POOL_VENUE");
    if (!(["SALE_GRADUATION", "MANUAL"] as PoolMode[]).includes(mode)) throw new Error("INVALID_POOL_MODE");
    for (const [name, value] of [["BASE_MINT", input.baseMint], ["QUOTE_MINT", input.quoteMint], ["AUTHORITY", input.authority], ["TREASURY_WALLET", input.treasuryWallet]] as const) {
      if (!isConfiguredAddress(String(value || ""))) throw new Error(`${name}_INVALID`);
    }
    if (String(input.baseMint) === String(input.quoteMint)) throw new Error("POOL_MINTS_MUST_DIFFER");
    if (mode === "SALE_GRADUATION" && !input.saleId) throw new Error("SALE_ID_REQUIRED");
    if (input.saleId && !(await getSale(String(input.saleId)))) throw new Error("SALE_NOT_FOUND");

    const createdAt = new Date().toISOString();
    const pool: LaunchPool = {
      id: crypto.randomUUID(),
      name: String(input.name || `${input.baseSymbol || "TOKEN"} / ${input.quoteSymbol || "QUOTE"}`).slice(0, 80),
      mode,
      saleId: input.saleId ? String(input.saleId) : undefined,
      baseMint: String(input.baseMint),
      baseSymbol: String(input.baseSymbol || "TOKEN").toUpperCase().slice(0, 12),
      baseDecimals: validateDecimals(input.baseDecimals ?? 9, "BASE_DECIMALS"),
      quoteMint: String(input.quoteMint),
      quoteSymbol: String(input.quoteSymbol || "QUOTE").toUpperCase().slice(0, 12),
      quoteDecimals: validateDecimals(input.quoteDecimals ?? 6, "QUOTE_DECIMALS"),
      venue,
      status: "DRAFT",
      authority: String(input.authority),
      treasuryWallet: String(input.treasuryWallet),
      initialBaseAmount: validatePoolAmount(input.initialBaseAmount ?? "0", "INITIAL_BASE_AMOUNT", true),
      initialQuoteAmount: validatePoolAmount(input.initialQuoteAmount ?? "0", "INITIAL_QUOTE_AMOUNT", true),
      feeTierBps: input.feeTierBps === undefined || input.feeTierBps === "" ? undefined : validatePoolBps(input.feeTierBps, "FEE_TIER_BPS", { allowZero: true }),
      launchAt: input.launchAt ? new Date(String(input.launchAt)).toISOString() : undefined,
      graduationThresholdBps: input.graduationThresholdBps === undefined ? 10_000 : validatePoolBps(input.graduationThresholdBps, "GRADUATION_THRESHOLD_BPS"),
      validated: false,
      revision: 1,
      configurationRevision: 1,
      createdAt,
      updatedAt: createdAt,
    };
    const created = await createPool(pool);
    await addAudit(String(body.address), "pool.create", created.id, { venue: created.venue, saleId: created.saleId || null });
    return Response.json({ pool: created, review: buildPoolReview(created, created.saleId ? await getSale(created.saleId) : null) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "POOL_CREATE_FAILED";
    const unauthorized = message.includes("CHALLENGE") || message.includes("SIGNATURE") || message.includes("ADMIN");
    return Response.json({ error: message }, { status: unauthorized ? 401 : 400 });
  }
}
