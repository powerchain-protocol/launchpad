import type {
  BoundCheckoutQuote,
  CheckoutTransactionIntent,
  RpcSettlementObservation,
  SettlementEvidence,
} from "@powerchain/launchpad-domain/checkout";
import type { CheckoutIntentRepository } from "./intent-service";
import type { CheckoutOrderRepository } from "./reconciliation";
import type { D1Database } from "./d1";
import { publishSettlementEvidence } from "../realtime/publisher";

interface OrderRow {
  id: string;
  quote_id: string;
  state: SettlementEvidence["state"];
  chain: SettlementEvidence["chain"];
  network: SettlementEvidence["network"];
  wallet: string;
  quote_hash: string;
  transaction_id: string | null;
  block_or_checkpoint: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  reconciled_at: string | null;
  receipt_id: string | null;
  last_rpc_error: string | null;
  reconciliation_attempts: number;
  last_reconciled_at: string | null;
  updated_at: string;
}

interface IntentRow {
  order_id: string;
  quote_id: string;
  quote_hash: string;
  intent_hash: string;
  chain: CheckoutTransactionIntent["chain"];
  network: CheckoutTransactionIntent["network"];
  wallet: string;
  transfers_json: string;
  service_fee_atomic: string;
  issued_at: string;
  expires_at: string;
}

function evidence(row: OrderRow): SettlementEvidence {
  return {
    orderId: row.id,
    quoteId: row.quote_id,
    state: row.state,
    chain: row.chain,
    network: row.network,
    wallet: row.wallet,
    quoteHash: row.quote_hash,
    ...(row.transaction_id ? { transactionId: row.transaction_id } : {}),
    ...(row.block_or_checkpoint ? { blockOrCheckpoint: row.block_or_checkpoint } : {}),
    ...(row.submitted_at ? { submittedAt: row.submitted_at } : {}),
    ...(row.verified_at ? { verifiedAt: row.verified_at } : {}),
    ...(row.reconciled_at ? { reconciledAt: row.reconciled_at } : {}),
    ...(row.receipt_id ? { receiptId: row.receipt_id } : {}),
    ...(row.last_rpc_error ? { lastRpcError: row.last_rpc_error } : {}),
    reconciliationAttempts: row.reconciliation_attempts,
    ...(row.last_reconciled_at ? { lastReconciledAt: row.last_reconciled_at } : {}),
    updatedAt: row.updated_at,
  };
}

export class D1CheckoutOrderRepository implements CheckoutOrderRepository, CheckoutIntentRepository {
  constructor(protected readonly d1: D1Database) {}

  async getEvidence(orderId: string): Promise<SettlementEvidence | null> {
    const row = await this.d1.prepare("SELECT * FROM checkout_orders WHERE id=?1").bind(orderId).first<OrderRow>();
    return row ? evidence(row) : null;
  }

  async updateEvidence(orderId: string, patch: Partial<SettlementEvidence>): Promise<SettlementEvidence> {
    const current = await this.getEvidence(orderId);
    if (!current) throw new Error("Checkout order not found.");
    const next = { ...current, ...patch };
    await this.d1.prepare(`UPDATE checkout_orders SET
      state=?2, transaction_id=?3, block_or_checkpoint=?4, submitted_at=?5, verified_at=?6,
      reconciled_at=?7, receipt_id=?8, last_rpc_error=?9, reconciliation_attempts=?10,
      last_reconciled_at=?11, updated_at=?12 WHERE id=?1`)
      .bind(
        orderId,
        next.state,
        next.transactionId ?? null,
        next.blockOrCheckpoint ?? null,
        next.submittedAt ?? null,
        next.verifiedAt ?? null,
        next.reconciledAt ?? null,
        next.receiptId ?? null,
        next.lastRpcError ?? null,
        next.reconciliationAttempts ?? 0,
        next.lastReconciledAt ?? null,
        next.updatedAt,
      ).run();
    const updated = await this.getEvidence(orderId);
    if (!updated) throw new Error("Checkout order disappeared after update.");
    await publishSettlementEvidence(updated);
    return updated;
  }

  async insert(intent: CheckoutTransactionIntent): Promise<void> {
    await this.d1.prepare(`INSERT INTO checkout_transaction_intents
      (order_id,quote_id,quote_hash,intent_hash,chain,network,wallet,transfers_json,service_fee_atomic,issued_at,expires_at)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`)
      .bind(intent.orderId, intent.quoteId, intent.quoteHash, intent.intentHash, intent.chain, intent.network, intent.wallet,
        JSON.stringify(intent.transfers), intent.serviceFeeAtomic, intent.issuedAt, intent.expiresAt).run();
  }

  async getByOrderId(orderId: string): Promise<CheckoutTransactionIntent | null> {
    const row = await this.d1.prepare("SELECT * FROM checkout_transaction_intents WHERE order_id=?1").bind(orderId).first<IntentRow>();
    if (!row) return null;
    const transfers = JSON.parse(row.transfers_json) as CheckoutTransactionIntent["transfers"];
    return {
      version: 1,
      orderId: row.order_id,
      quoteId: row.quote_id,
      quoteHash: row.quote_hash,
      intentHash: row.intent_hash,
      chain: row.chain,
      network: row.network,
      wallet: row.wallet,
      transfers,
      serviceFeeAtomic: row.service_fee_atomic,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
    };
  }

  async recordRpcObservations(orderId: string, observations: RpcSettlementObservation[]): Promise<void> {
    if (!observations.length) return;
    const statements = observations.map((observation) => this.d1.prepare(`INSERT INTO checkout_rpc_observations
      (order_id,provider_id,status,transaction_id,block_or_checkpoint,reason,observed_at)
      VALUES(?1,?2,?3,?4,?5,?6,?7)`)
      .bind(orderId, observation.providerId, observation.status, observation.transactionId ?? null,
        observation.blockOrCheckpoint ?? null, observation.reason ?? null, observation.observedAt));
    await this.d1.batch(statements);
  }
}


export interface StoredCheckoutQuote extends BoundCheckoutQuote {
  serviceFeeRecipient: string;
  priceSource: string;
}

export interface StoredPreparedOrder {
  orderId: string;
  idempotencyKey: string;
  quoteId: string;
  quoteHash: string;
  wallet: string;
  chain: "solana" | "sui";
  network: string;
  state: SettlementEvidence["state"];
  intentHash: string;
  transactionBase64?: string;
  lastValidBlockHeight?: number;
}

export interface CheckoutReceiptView {
  id: string;
  orderId: string;
  quoteHash: string;
  intentHash: string;
  transactionId: string;
  createdAt: string;
}

export interface RealtimeSessionRow {
  jti: string;
  subject: string;
  topics: string[];
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export class D1CheckoutRepository extends D1CheckoutOrderRepository {
  async insertQuote(quote: StoredCheckoutQuote): Promise<void> {
    await this.d1.prepare(`INSERT INTO checkout_quotes
      (id,quote_hash,chain,network,wallet,payment_asset,payment_amount_atomic,receive_mint_or_type,receive_amount_atomic,treasury_address,service_fee_atomic,service_fee_recipient,nonce,issued_at,expires_at,price_source)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)`)
      .bind(quote.quoteId, quote.quoteHash, quote.chain, quote.network, quote.wallet, quote.paymentAsset,
        quote.paymentAmountAtomic, quote.receiveMintOrType, quote.receiveAmountAtomic, quote.treasuryAddress,
        quote.serviceFeeAtomic, quote.serviceFeeRecipient, quote.nonce, quote.issuedAt, quote.expiresAt, quote.priceSource).run();
  }

  async getQuote(quoteId: string): Promise<StoredCheckoutQuote | null> {
    const row = await this.d1.prepare("SELECT * FROM checkout_quotes WHERE id=?1").bind(quoteId).first<Record<string, unknown>>();
    if (!row) return null;
    return {
      version: 1,
      quoteId: String(row.id), quoteHash: String(row.quote_hash), chain: row.chain as "solana" | "sui",
      network: row.network as StoredCheckoutQuote["network"], wallet: String(row.wallet), paymentAsset: row.payment_asset as StoredCheckoutQuote["paymentAsset"],
      paymentAmountAtomic: String(row.payment_amount_atomic), receiveMintOrType: String(row.receive_mint_or_type), receiveAmountAtomic: String(row.receive_amount_atomic),
      treasuryAddress: String(row.treasury_address), serviceFeeAtomic: String(row.service_fee_atomic), serviceFeeRecipient: String(row.service_fee_recipient),
      nonce: String(row.nonce), issuedAt: String(row.issued_at), expiresAt: String(row.expires_at), priceSource: String(row.price_source ?? "unknown"),
    };
  }

  async getPreparedByIdempotencyKey(key: string): Promise<StoredPreparedOrder | null> {
    const row = await this.d1.prepare("SELECT * FROM checkout_orders WHERE idempotency_key=?1").bind(key).first<Record<string, unknown>>();
    return row ? this.mapPrepared(row) : null;
  }

  async getPreparedOrder(orderId: string): Promise<StoredPreparedOrder | null> {
    const row = await this.d1.prepare("SELECT * FROM checkout_orders WHERE id=?1").bind(orderId).first<Record<string, unknown>>();
    return row ? this.mapPrepared(row) : null;
  }

  private mapPrepared(row: Record<string, unknown>): StoredPreparedOrder {
    const transactionBase64 = typeof row.transaction_base64 === "string" ? row.transaction_base64 : undefined;
    const height = typeof row.last_valid_block_height === "number" ? row.last_valid_block_height : undefined;
    return {
      orderId: String(row.id), idempotencyKey: String(row.idempotency_key), quoteId: String(row.quote_id), quoteHash: String(row.quote_hash),
      wallet: String(row.wallet), chain: row.chain as "solana" | "sui", network: String(row.network), state: row.state as SettlementEvidence["state"],
      intentHash: String(row.intent_hash), ...(transactionBase64 ? { transactionBase64 } : {}), ...(height ? { lastValidBlockHeight: height } : {}),
    };
  }

  async createPreparedOrder(input: StoredPreparedOrder, intent: CheckoutTransactionIntent): Promise<void> {
    const now = new Date().toISOString();
    const order = this.d1.prepare(`INSERT INTO checkout_orders
      (id,idempotency_key,quote_id,quote_hash,wallet,chain,network,state,intent_hash,transaction_base64,last_valid_block_height,created_at,updated_at)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)`)
      .bind(input.orderId, input.idempotencyKey, input.quoteId, input.quoteHash, input.wallet, input.chain, input.network,
        input.state, input.intentHash, input.transactionBase64 ?? null, input.lastValidBlockHeight ?? null, now);
    const intentStatement = this.d1.prepare(`INSERT INTO checkout_transaction_intents
      (order_id,quote_id,quote_hash,intent_hash,chain,network,wallet,transfers_json,service_fee_atomic,issued_at,expires_at)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`)
      .bind(intent.orderId, intent.quoteId, intent.quoteHash, intent.intentHash, intent.chain, intent.network, intent.wallet,
        JSON.stringify(intent.transfers), intent.serviceFeeAtomic, intent.issuedAt, intent.expiresAt);
    await this.d1.batch([order, intentStatement]);
  }

  async markSubmitted(orderId: string, transactionId: string): Promise<SettlementEvidence> {
    const current = await this.getEvidence(orderId); if (!current) throw new Error("Checkout order not found.");
    if (current.transactionId && current.transactionId !== transactionId) throw new Error("Order is already bound to a different transaction id.");
    const now = new Date().toISOString();
    return this.updateEvidence(orderId, { state: current.state === "AWAITING_SIGNATURE" ? "SUBMITTED" : current.state, transactionId, submittedAt: current.submittedAt ?? now, updatedAt: now });
  }

  async getReceipt(orderId: string): Promise<CheckoutReceiptView | null> {
    const row = await this.d1.prepare("SELECT * FROM checkout_receipts WHERE order_id=?1").bind(orderId).first<Record<string, unknown>>();
    return row ? { id: String(row.id), orderId: String(row.order_id), quoteHash: String(row.quote_hash), intentHash: String(row.intent_hash), transactionId: String(row.transaction_id), createdAt: String(row.created_at) } : null;
  }

  async issueReceipt(orderId: string): Promise<CheckoutReceiptView> {
    const existing = await this.getReceipt(orderId); if (existing) return existing;
    const evidence = await this.getEvidence(orderId); const intent = await this.getByOrderId(orderId);
    if (!evidence || !intent || !evidence.transactionId || !["SETTLED", "RECONCILED", "RECEIPTED"].includes(evidence.state)) throw new Error("Order is not eligible for receipt issuance.");
    const id = crypto.randomUUID(); const createdAt = new Date().toISOString();
    await this.d1.prepare(`INSERT INTO checkout_receipts(id,order_id,quote_hash,intent_hash,transaction_id,evidence_json,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)`)
      .bind(id, orderId, evidence.quoteHash, intent.intentHash, evidence.transactionId, JSON.stringify(evidence), createdAt).run();
    await this.updateEvidence(orderId, { state: "RECEIPTED", receiptId: id, reconciledAt: evidence.reconciledAt ?? createdAt, updatedAt: createdAt });
    return { id, orderId, quoteHash: evidence.quoteHash, intentHash: intent.intentHash, transactionId: evidence.transactionId, createdAt };
  }

  async insertRealtimeSession(row: RealtimeSessionRow): Promise<void> {
    await this.d1.prepare(`INSERT INTO realtime_sessions(jti,subject,topics_json,token_hash,expires_at,created_at) VALUES(?1,?2,?3,?4,?5,?6)`)
      .bind(row.jti, row.subject, JSON.stringify(row.topics), row.tokenHash, row.expiresAt, row.createdAt).run();
  }
}
