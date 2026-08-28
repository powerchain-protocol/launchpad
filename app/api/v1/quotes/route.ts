import crypto from "node:crypto";
import { Connection } from "@solana/web3.js";
import { config } from "@/lib/config";
import { serviceFee } from "@/lib/fees";
import { sha256Hex } from "@/lib/server/canonical";
import { addQuote, getQuoteByIdempotencyKey, getSale } from "@/lib/server/store";
import { assertOperationalConfig, integerAmount, isConfiguredAddress } from "@/lib/server/validation";
import { quotePwrcToken2022Payment } from "@/lib/solana/token2022-fee";
import type { PaymentAsset, QuoteKind, QuoteRecord } from "@/types/domain";

export const runtime = "nodejs";
const supported = new Set<PaymentAsset>(["SOL", "USDC", "PWRC"]);

export async function POST(req: Request) {
  try {
    assertOperationalConfig();
    const body = await req.json();
    const idempotencyKey = String(body.idempotencyKey || "").trim();
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
    const kind = String(body.kind || "PAYMENT").toUpperCase() as QuoteKind;
    const asset = String(body.asset || "SOL").toUpperCase() as PaymentAsset;
    const amount = integerAmount(body.amount);
    const payer = body.payer ? String(body.payer) : undefined;
    const requestedSaleId = body.saleId ? String(body.saleId) : undefined;
    if (!supported.has(asset)) throw new Error("ASSET_NOT_SUPPORTED");
    if (payer && !isConfiguredAddress(payer)) throw new Error("INVALID_PAYER");
    const requestHash = sha256Hex({ kind, asset, amount: amount.toString(), payer, saleId: requestedSaleId });
    const replay = await getQuoteByIdempotencyKey(idempotencyKey);
    if (replay) {
      if (replay.requestHash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
      return Response.json({ quote: replay, quoteHash: replay.quoteHash, replayed: true });
    }

    let recipient = config.merchantWallet;
    let tokenAmount: string | undefined;
    let saleId: string | undefined;

    if (kind === "TOKEN_PURCHASE") {
      saleId = requestedSaleId || "";
      const sale = await getSale(saleId);
      if (!sale) throw new Error("SALE_NOT_FOUND");
      if (!sale.validated) throw new Error("SALE_CONFIGURATION_NOT_VALIDATED");
      const now = Date.now();
      if (sale.stage !== "LIVE" || now < Date.parse(sale.startsAt) || now >= Date.parse(sale.endsAt)) throw new Error("SALE_NOT_LIVE");
      if (!(sale.acceptedAssets || ["USDC"]).includes(asset)) throw new Error("PAYMENT_ASSET_NOT_ACCEPTED_FOR_SALE");
      if (asset !== "USDC") throw new Error("SALE_PURCHASE_CURRENTLY_REQUIRES_USDC_FOR_DETERMINISTIC_USD_PRICING");
      recipient = sale.merchantWallet;
      const priceMicros = BigInt(Math.round(sale.priceUsd * 1_000_000));
      if (priceMicros <= 0n) throw new Error("SALE_PRICE_PRECISION_TOO_LOW");
      tokenAmount = ((amount * (10n ** BigInt(sale.decimals))) / priceMicros).toString();
      if (BigInt(tokenAmount) <= 0n) throw new Error("PURCHASE_BELOW_MINIMUM_TOKEN_UNIT");
      const capUnits = BigInt(Math.trunc(sale.hardCap)) * (10n ** BigInt(sale.decimals));
      const soldUnits = BigInt(sale.soldBaseUnits);
      if (soldUnits + BigInt(tokenAmount) > capUnits) throw new Error("SALE_CAP_EXCEEDED");
    } else if (kind !== "PAYMENT") {
      throw new Error("INVALID_QUOTE_KIND");
    }

    if (!isConfiguredAddress(recipient)) throw new Error("MERCHANT_WALLET_NOT_CONFIGURED");
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 120_000);
    let mint: string | undefined;
    let feeMechanism: QuoteRecord["feeMechanism"] = "explicit-platform-transfer";
    let fee: bigint;
    let totalDebit: bigint;

    if (asset === "PWRC") {
      if (!isConfiguredAddress(config.pwrcMint)) throw new Error("PWRC_MINT_NOT_CONFIGURED");
      const exact = await quotePwrcToken2022Payment(new Connection(config.rpcUrl, "confirmed"), config.pwrcMint, amount);
      mint = config.pwrcMint;
      fee = exact.fee;
      totalDebit = exact.gross;
      feeMechanism = "token-2022-transfer-fee-extension";
    } else {
      fee = serviceFee(amount, 200n);
      totalDebit = amount + fee;
      if (asset === "USDC") {
        if (!isConfiguredAddress(config.usdcMint)) throw new Error("USDC_MINT_NOT_CONFIGURED");
        mint = config.usdcMint;
      }
    }

    const merchantReceives = asset === "PWRC" ? amount.toString() : undefined;
    const core = {
      idempotencyKey,
      requestHash,
      kind,
      saleId,
      payer,
      recipient,
      feeTreasury: config.feeTreasury,
      asset,
      mint,
      amount: amount.toString(),
      serviceFee: fee.toString(),
      totalDebit: totalDebit.toString(),
      merchantReceives,
      serviceFeeBps: 200,
      feeMechanism,
      tokenAmount,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    const quote: QuoteRecord = { id: crypto.randomUUID(), ...core, quoteHash: sha256Hex(core) };
    await addQuote(quote);
    return Response.json({ quote, quoteHash: quote.quoteHash });
  } catch (error) {
    const message = error instanceof Error ? error.message : "QUOTE_FAILED";
    return Response.json({ error: message }, { status: message === "IDEMPOTENCY_CONFLICT" ? 409 : 400 });
  }
}
