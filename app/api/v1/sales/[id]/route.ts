import { consumeSignedChallenge } from "@/lib/server/auth";
import { addAudit, getSale, updateSale } from "@/lib/server/store";
import { isConfiguredAddress } from "@/lib/server/validation";
import type { PaymentAsset, SaleStage, SaleTier } from "@/types/domain";

const stages: SaleStage[] = ["DRAFT", "SCHEDULED", "LIVE", "ENDED", "CLAIMING", "COMPLETED"];
const nextStages: Record<SaleStage, SaleStage[]> = {
  DRAFT: ["SCHEDULED", "LIVE"],
  SCHEDULED: ["DRAFT", "LIVE"],
  LIVE: ["ENDED"],
  ENDED: ["CLAIMING"],
  CLAIMING: ["COMPLETED"],
  COMPLETED: [],
};

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sale = await getSale(id);
  return sale ? Response.json({ sale }) : Response.json({ error: "NOT_FOUND" }, { status: 404 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    await consumeSignedChallenge({ challengeId: String(body.challengeId || ""), address: String(body.address || ""), purpose: `admin:sale:${id}:update`, signature: String(body.signature || ""), admin: true });
    const patch = body.patch || {};
    const expectedRevision = Number(body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error("EXPECTED_SALE_REVISION_REQUIRED");
    const existing = await getSale(id);
    if (!existing) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    if (patch.stage && !stages.includes(patch.stage)) throw new Error("INVALID_STAGE");
    if (patch.stage && patch.stage !== existing.stage && !nextStages[existing.stage].includes(patch.stage)) throw new Error(`INVALID_STAGE_TRANSITION:${existing.stage}_TO_${patch.stage}`);
    if (patch.hardCap !== undefined && (!Number.isSafeInteger(Number(patch.hardCap)) || Number(patch.hardCap) <= 0)) throw new Error("INVALID_HARD_CAP");
    if (patch.priceUsd !== undefined && (!Number.isFinite(Number(patch.priceUsd)) || Number(patch.priceUsd) <= 0)) throw new Error("INVALID_PRICE");

    const startsAt = patch.startsAt ?? existing.startsAt;
    const endsAt = patch.endsAt ?? existing.endsAt;
    const claimAt = patch.claimAt ?? existing.claimAt;
    if (![startsAt, endsAt, claimAt].every((value) => Number.isFinite(Date.parse(value)))) throw new Error("INVALID_SALE_DATE");
    if (!(Date.parse(startsAt) < Date.parse(endsAt) && Date.parse(endsAt) <= Date.parse(claimAt))) throw new Error("INVALID_SALE_SCHEDULE");
    if (patch.merchantWallet && !isConfiguredAddress(String(patch.merchantWallet))) throw new Error("INVALID_MERCHANT_WALLET");

    const nextHardCap = patch.hardCap === undefined ? existing.hardCap : Number(patch.hardCap);
    const capUnits = BigInt(nextHardCap) * 10n ** BigInt(existing.decimals);
    if (capUnits < BigInt(existing.soldBaseUnits || "0")) throw new Error("HARD_CAP_BELOW_SOLD_AMOUNT");

    const nextValidated = patch.validated === undefined ? existing.validated : Boolean(patch.validated);
    const nextStage = (patch.stage ?? existing.stage) as SaleStage;
    const currentTime = Date.now();
    if (nextStage === "LIVE") {
      if (!nextValidated) throw new Error("SALE_MUST_BE_VALIDATED_BEFORE_LIVE");
      if (currentTime < Date.parse(startsAt) || currentTime >= Date.parse(endsAt)) throw new Error("SALE_LIVE_OUTSIDE_CONFIGURED_WINDOW");
    }
    if (nextStage === "CLAIMING" && currentTime < Date.parse(claimAt)) throw new Error("CLAIM_WINDOW_NOT_OPEN");

    const acceptedAssets = patch.acceptedAssets === undefined ? undefined : validateAcceptedAssets(patch.acceptedAssets);
    const tiers = patch.tiers === undefined ? undefined : validateTiers(patch.tiers);
    const allowed = {
      name: patch.name === undefined ? undefined : String(patch.name).trim().slice(0, 120),
      symbol: patch.symbol === undefined ? undefined : String(patch.symbol).trim().toUpperCase().slice(0, 12),
      merchantWallet: patch.merchantWallet,
      priceUsd: patch.priceUsd === undefined ? undefined : Number(patch.priceUsd),
      hardCap: patch.hardCap === undefined ? undefined : Number(patch.hardCap),
      startsAt: patch.startsAt,
      endsAt: patch.endsAt,
      claimAt: patch.claimAt,
      stage: patch.stage,
      validated: patch.validated === undefined ? undefined : Boolean(patch.validated),
      acceptedAssets,
      tiers,
    };
    Object.keys(allowed).forEach((key) => (allowed as Record<string, unknown>)[key] === undefined && delete (allowed as Record<string, unknown>)[key]);
    const sale = await updateSale(id, allowed, { expectedRevision });
    await addAudit(String(body.address), "sale.update", id, { stage: sale?.stage || null, validated: sale?.validated || false, revision: sale?.revision || null });
    return Response.json({ sale });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPDATE_FAILED";
    const unauthorized = message.includes("CHALLENGE") || message.includes("SIGNATURE") || message.includes("ADMIN");
    const conflict = message.includes("REVISION_CONFLICT");
    return Response.json({ error: message }, { status: unauthorized ? 401 : conflict ? 409 : 400 });
  }
}

function validateAcceptedAssets(value: unknown): PaymentAsset[] {
  if (!Array.isArray(value)) throw new Error("INVALID_ACCEPTED_ASSETS");
  const assets = [...new Set(value.map((item) => String(item)).filter((item): item is PaymentAsset => ["SOL", "USDC", "PWRC"].includes(item)))];
  if (!assets.length) throw new Error("AT_LEAST_ONE_ACCEPTED_ASSET_REQUIRED");
  return assets;
}

function validateTiers(value: unknown): SaleTier[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error("INVALID_SALE_TIERS");
  const ids = new Set<string>();
  return value.map((raw, index) => {
    const item = raw as Partial<SaleTier>;
    const id = String(item.id || `tier-${index + 1}`).trim().slice(0, 40);
    const name = String(item.name || "").trim().slice(0, 80);
    const minAmount = Number(item.minAmount);
    const maxAmount = Number(item.maxAmount);
    const bonusBps = Number(item.bonusBps || 0);
    if (!id || ids.has(id)) throw new Error("DUPLICATE_OR_EMPTY_TIER_ID");
    if (!name) throw new Error("TIER_NAME_REQUIRED");
    if (!Number.isSafeInteger(minAmount) || !Number.isSafeInteger(maxAmount) || minAmount < 0 || maxAmount < minAmount) throw new Error("INVALID_TIER_RANGE");
    if (!Number.isInteger(bonusBps) || bonusBps < 0 || bonusBps > 10_000) throw new Error("INVALID_TIER_BONUS_BPS");
    ids.add(id);
    return { id, name, minAmount, maxAmount, bonusBps, enabled: Boolean(item.enabled) };
  });
}
