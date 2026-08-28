import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  AuditEvent,
  AuthChallenge,
  ClaimAllocation,
  LaunchPool,
  PurchaseRecord,
  QuoteRecord,
  Sale,
  TransactionIntent,
  TransactionRecord,
} from "@/types/domain";

type DB = {
  version: 4;
  sales: Sale[];
  pools: LaunchPool[];
  quotes: QuoteRecord[];
  transactions: TransactionRecord[];
  intents: TransactionIntent[];
  challenges: AuthChallenge[];
  purchases: PurchaseRecord[];
  claims: ClaimAllocation[];
  audit: AuditEvent[];
};

const now = () => new Date().toISOString();

const seedSale: Sale = {
  id: "demo",
  name: "PowerChain Token Sale",
  symbol: "PWRC",
  mint: process.env.NEXT_PUBLIC_PWRC_MINT || "CONFIGURE_PWRC_MINT",
  authority: process.env.SALE_AUTHORITY || "CONFIGURE_SALE_AUTHORITY",
  decimals: 9,
  merchantWallet: process.env.MERCHANT_WALLET || "CONFIGURE_MERCHANT_WALLET",
  priceUsd: 0.000002,
  hardCap: 1_000_000_000,
  sold: 318_400_000,
  soldBaseUnits: "318400000000000000",
  startsAt: new Date(Date.now() - 86_400_000).toISOString(),
  endsAt: new Date(Date.now() + 6 * 86_400_000).toISOString(),
  claimAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  stage: "LIVE",
  validated: false,
  updatedAt: now(),
  revision: 1,
  acceptedAssets: ["USDC"],
  tiers: [
    { id: "community", name: "Community", minAmount: 1, maxAmount: 1_000_000, bonusBps: 0, enabled: true },
    { id: "growth", name: "Growth", minAmount: 1_000_001, maxAmount: 10_000_000, bonusBps: 250, enabled: true },
  ],
};

const seedPool: LaunchPool = {
  id: "pwrc-usdc",
  name: "PWRC / USDC",
  mode: "SALE_GRADUATION",
  saleId: "demo",
  baseMint: process.env.NEXT_PUBLIC_PWRC_MINT || "CONFIGURE_PWRC_MINT",
  baseSymbol: "PWRC",
  baseDecimals: 9,
  quoteMint: process.env.NEXT_PUBLIC_USDC_MINT || "CONFIGURE_USDC_MINT",
  quoteSymbol: "USDC",
  quoteDecimals: 6,
  venue: "RAYDIUM_CPMM",
  status: "DRAFT",
  authority: process.env.SALE_AUTHORITY || "CONFIGURE_SALE_AUTHORITY",
  treasuryWallet: process.env.MERCHANT_WALLET || "CONFIGURE_MERCHANT_WALLET",
  initialBaseAmount: "0",
  initialQuoteAmount: "0",
  graduationThresholdBps: 10_000,
  validated: false,
  revision: 1,
  configurationRevision: 1,
  createdAt: now(),
  updatedAt: now(),
};

const emptyDB = (): DB => ({
  version: 4,
  sales: [seedSale],
  pools: [seedPool],
  quotes: [],
  transactions: [],
  intents: [],
  challenges: [],
  purchases: [],
  claims: [],
  audit: [],
});

const file = path.resolve(process.cwd(), process.env.DATA_FILE || ".data/powerchain.json");
let queue: Promise<void> = Promise.resolve();

function migrate(raw: Partial<DB>): DB {
  return {
    version: 4,
    sales: raw.sales?.length ? raw.sales.map((sale) => { const decimals = Number.isInteger(sale.decimals) ? sale.decimals : 9; return { ...sale, authority: sale.authority || process.env.SALE_AUTHORITY || "CONFIGURE_SALE_AUTHORITY", decimals, soldBaseUnits: sale.soldBaseUnits || (BigInt(Math.trunc(sale.sold || 0)) * (10n ** BigInt(decimals))).toString(), revision: Number.isInteger(sale.revision) && sale.revision > 0 ? sale.revision : 1, acceptedAssets: sale.acceptedAssets || ["USDC"] }; }) : [seedSale],
    pools: raw.pools?.length ? raw.pools.map((pool) => ({
      ...pool,
      baseDecimals: Number.isInteger(pool.baseDecimals) ? pool.baseDecimals : (pool.baseSymbol === "USDC" ? 6 : 9),
      quoteDecimals: Number.isInteger(pool.quoteDecimals) ? pool.quoteDecimals : (pool.quoteSymbol === "USDC" ? 6 : 9),
      graduationThresholdBps: Number.isInteger(pool.graduationThresholdBps) ? pool.graduationThresholdBps : 10_000,
      revision: Number.isInteger(pool.revision) && pool.revision > 0 ? pool.revision : 1,
      configurationRevision: Number.isInteger(pool.configurationRevision) && pool.configurationRevision > 0 ? pool.configurationRevision : 1,
    })) : [seedPool],
    quotes: (raw.quotes || []).map((quote) => ({ ...quote, idempotencyKey: quote.idempotencyKey || `legacy:${quote.id}`, requestHash: quote.requestHash || `legacy:${quote.id}` })),
    transactions: raw.transactions || [],
    intents: raw.intents || [],
    challenges: raw.challenges || [],
    purchases: raw.purchases || [],
    claims: raw.claims || [],
    audit: raw.audit || [],
  };
}

async function ensure() {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, JSON.stringify(emptyDB(), null, 2));
  }
}

async function read(): Promise<DB> {
  await ensure();
  const raw = JSON.parse(await fs.readFile(file, "utf8"));
  return migrate(raw);
}

async function write(db: DB) {
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(db, null, 2));
  await fs.rename(temp, file);
}

async function mutate<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  let result!: T;
  const run = queue.then(async () => {
    const db = await read();
    result = await fn(db);
    await write(db);
  });
  queue = run.then(() => undefined, () => undefined);
  await run;
  return result;
}

export async function listSales() {
  return (await read()).sales;
}
export async function getSale(id: string) {
  return (await read()).sales.find((x) => x.id === id) || null;
}
export async function updateSale(id: string, patch: Partial<Sale>, options: { expectedRevision?: number; bumpRevision?: boolean } = {}) {
  return mutate((db) => {
    const index = db.sales.findIndex((x) => x.id === id);
    if (index < 0) return null;
    const current = db.sales[index];
    if (options.expectedRevision !== undefined && current.revision !== options.expectedRevision) throw new Error(`SALE_REVISION_CONFLICT:${current.revision}`);
    const revision = options.bumpRevision === false ? current.revision : current.revision + 1;
    db.sales[index] = { ...current, ...patch, id, revision, updatedAt: now() };
    return db.sales[index];
  });
}

export async function listPools() {
  return (await read()).pools;
}
export async function getPool(id: string) {
  return (await read()).pools.find((x) => x.id === id) || null;
}
export async function createPool(pool: LaunchPool) {
  return mutate((db) => {
    if (db.pools.some((x) => x.id === pool.id)) throw new Error("POOL_ID_EXISTS");
    db.pools.unshift(pool);
    return pool;
  });
}
export async function updatePool(id: string, patch: Partial<LaunchPool>, options: { expectedRevision?: number; configurationChanged?: boolean; bumpRevision?: boolean } = {}) {
  return mutate((db) => {
    const index = db.pools.findIndex((x) => x.id === id);
    if (index < 0) return null;
    const current = db.pools[index];
    if (options.expectedRevision !== undefined && current.revision !== options.expectedRevision) throw new Error(`POOL_REVISION_CONFLICT:${current.revision}`);
    const revision = options.bumpRevision === false ? current.revision : current.revision + 1;
    const configurationRevision = options.configurationChanged ? current.configurationRevision + 1 : current.configurationRevision;
    db.pools[index] = { ...current, ...patch, id, revision, configurationRevision, updatedAt: now() };
    return db.pools[index];
  });
}

export async function createChallenge(challenge: AuthChallenge) {
  return mutate((db) => {
    db.challenges = db.challenges.filter((x) => Date.parse(x.expiresAt) > Date.now() - 300_000).slice(-250);
    db.challenges.push(challenge);
    return challenge;
  });
}
export async function getChallenge(id: string) {
  return (await read()).challenges.find((x) => x.id === id) || null;
}
export async function consumeChallenge(id: string) {
  return mutate((db) => {
    const challenge = db.challenges.find((x) => x.id === id);
    if (!challenge || challenge.consumedAt || Date.parse(challenge.expiresAt) <= Date.now()) return null;
    challenge.consumedAt = now();
    return challenge;
  });
}

export async function addQuote(quote: QuoteRecord) {
  return mutate((db) => {
    db.quotes = [quote, ...db.quotes.filter((x) => x.id !== quote.id)].slice(0, 2_000);
    return quote;
  });
}
export async function getQuote(id: string) {
  return (await read()).quotes.find((x) => x.id === id) || null;
}
export async function getQuoteByIdempotencyKey(idempotencyKey: string) {
  return (await read()).quotes.find((x) => x.idempotencyKey === idempotencyKey) || null;
}

export async function addIntent(intent: TransactionIntent) {
  return mutate((db) => {
    const existing = db.intents.find((x) => x.id === intent.id);
    if (existing) return existing;
    db.intents.unshift(intent);
    db.intents = db.intents.slice(0, 10_000);
    return intent;
  });
}
export async function getIntent(id: string) {
  return (await read()).intents.find((x) => x.id === id) || null;
}
export async function consumeIntent(id: string, signature: string) {
  return mutate((db) => {
    const intent = db.intents.find((x) => x.id === id);
    if (!intent || intent.consumedAt) return null;
    intent.consumedAt = now();
    intent.signature = signature;
    return intent;
  });
}

export async function addTx(tx: TransactionRecord) {
  return mutate((db) => {
    const sameSignature = tx.signature && db.transactions.find((x) => x.signature === tx.signature);
    if (sameSignature) return sameSignature;
    const existing = db.transactions.find((x) => x.id === tx.id);
    if (!existing) db.transactions.unshift(tx);
    return existing || tx;
  });
}
export async function listTx() {
  return (await read()).transactions;
}
export async function getTxByIntent(intentId: string) {
  return (await read()).transactions.find((x) => x.intentId === intentId) || null;
}
export async function updateTx(id: string, patch: Partial<TransactionRecord>) {
  return mutate((db) => {
    const index = db.transactions.findIndex((x) => x.id === id);
    if (index < 0) return null;
    db.transactions[index] = { ...db.transactions[index], ...patch, id };
    return db.transactions[index];
  });
}

export async function finalizeValidatedQuote(args: { quoteId: string; tx: TransactionRecord }) {
  return mutate((db) => {
    const quote = db.quotes.find((x) => x.id === args.quoteId);
    if (!quote) throw new Error("QUOTE_NOT_FOUND");
    if (quote.settledAt && quote.transactionId) {
      const existing = db.transactions.find((x) => x.id === quote.transactionId);
      if (!existing) throw new Error("SETTLED_TRANSACTION_MISSING");
      return existing;
    }
    const duplicate = args.tx.signature && db.transactions.find((x) => x.signature === args.tx.signature);
    const settledTx = duplicate ? Object.assign(duplicate, { ...args.tx, id: duplicate.id, quoteId: quote.id }) : args.tx;
    if (!duplicate && !db.transactions.some((x) => x.id === settledTx.id)) db.transactions.unshift(settledTx);
    quote.settledAt = settledTx.validatedAt || now();
    quote.transactionId = settledTx.id;

    if (quote.kind === "TOKEN_PURCHASE" && !db.purchases.some((x) => x.quoteId === quote.id)) {
      if (!quote.saleId || !quote.tokenAmount) throw new Error("PURCHASE_QUOTE_INCOMPLETE");
      const sale = db.sales.find((x) => x.id === quote.saleId);
      if (!sale) throw new Error("SALE_NOT_FOUND");
      const tokenUnits = BigInt(quote.tokenAmount);
      const unit = 10n ** BigInt(sale.decimals);
      const nextSoldUnits = BigInt(sale.soldBaseUnits) + tokenUnits;
      const capUnits = BigInt(Math.trunc(sale.hardCap)) * unit;
      if (nextSoldUnits > capUnits) throw new Error("SALE_CAP_EXCEEDED");
      sale.soldBaseUnits = nextSoldUnits.toString();
      sale.sold = Number(nextSoldUnits) / (10 ** sale.decimals);
      sale.updatedAt = now();
      const purchase: PurchaseRecord = {
        id: crypto.randomUUID(),
        quoteId: quote.id,
        transactionId: settledTx.id,
        saleId: quote.saleId,
        buyer: settledTx.payer,
        paymentAsset: quote.asset,
        paymentAmount: quote.amount,
        tokenAmount: quote.tokenAmount,
        createdAt: now(),
      };
      db.purchases.unshift(purchase);
      const allocation = db.claims.find((x) => x.saleId === quote.saleId && x.wallet === settledTx.payer);
      if (allocation) {
        allocation.purchased = (BigInt(allocation.purchased) + tokenUnits).toString();
        allocation.updatedAt = now();
      } else {
        db.claims.push({ saleId: quote.saleId, wallet: settledTx.payer, purchased: tokenUnits.toString(), claimed: "0", updatedAt: now() });
      }
    }
    return settledTx;
  });
}

export async function getClaimAllocation(saleId: string, wallet: string) {
  return (await read()).claims.find((x) => x.saleId === saleId && x.wallet === wallet) || null;
}

export async function addAudit(actor: string, action: string, subject?: string, metadata?: AuditEvent["metadata"]) {
  const event: AuditEvent = { id: crypto.randomUUID(), actor, action, subject, createdAt: now(), metadata };
  return mutate((db) => {
    db.audit.unshift(event);
    db.audit = db.audit.slice(0, 2_000);
    return event;
  });
}
export async function listAudit(limit = 50) {
  return (await read()).audit.slice(0, limit);
}

export async function finalizeValidatedIntentPurchase(intentId: string, transactionId: string) {
  return mutate((db) => {
    const intent = db.intents.find((x) => x.id === intentId);
    if (!intent || intent.kind !== "TOKEN_PURCHASE" || intent.quoteId) return null;
    if (!intent.saleId || !intent.tokenAmount) throw new Error("PURCHASE_INTENT_INCOMPLETE");
    const tx = db.transactions.find((x) => x.id === transactionId);
    if (!tx || tx.status !== "VALIDATED") throw new Error("PURCHASE_TRANSACTION_NOT_VALIDATED");
    const existing = db.purchases.find((x) => x.transactionId === transactionId);
    if (existing) return existing;
    const sale = db.sales.find((x) => x.id === intent.saleId);
    if (!sale) throw new Error("SALE_NOT_FOUND");
    const tokenUnits = BigInt(intent.tokenAmount);
    const unit = 10n ** BigInt(sale.decimals);
    const nextSoldUnits = BigInt(sale.soldBaseUnits) + tokenUnits;
    const capUnits = BigInt(Math.trunc(sale.hardCap)) * unit;
    if (nextSoldUnits > capUnits) throw new Error("SALE_CAP_EXCEEDED");
    sale.soldBaseUnits = nextSoldUnits.toString();
    sale.sold = Number(nextSoldUnits) / (10 ** sale.decimals);
    sale.updatedAt = now();
    const purchase: PurchaseRecord = {
      id: crypto.randomUUID(),
      transactionId,
      saleId: sale.id,
      buyer: intent.payer,
      paymentAsset: "SOL",
      tokenAmount: intent.tokenAmount,
      createdAt: now(),
    };
    db.purchases.unshift(purchase);
    const allocation = db.claims.find((x) => x.saleId === sale.id && x.wallet === intent.payer);
    if (allocation) {
      allocation.purchased = (BigInt(allocation.purchased) + tokenUnits).toString();
      allocation.updatedAt = now();
    } else {
      db.claims.push({ saleId: sale.id, wallet: intent.payer, purchased: tokenUnits.toString(), claimed: "0", updatedAt: now() });
    }
    return purchase;
  });
}
