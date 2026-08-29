import { createHash } from "node:crypto";
import { canonicalCheckoutIntentPayload, validateCheckoutIntent, type BoundCheckoutQuote, type CheckoutTransactionIntent } from "@powerchain/launchpad-domain/checkout";

export interface CheckoutIntentRepository {
  insert(intent: CheckoutTransactionIntent): Promise<void>;
  getByOrderId(orderId: string): Promise<CheckoutTransactionIntent | null>;
}

export function buildCheckoutIntent(input: {
  orderId: string;
  quote: BoundCheckoutQuote;
  transfers: CheckoutTransactionIntent["transfers"];
}): CheckoutTransactionIntent {
  const unsigned = {
    version: 1 as const,
    orderId: input.orderId,
    quoteId: input.quote.quoteId,
    quoteHash: input.quote.quoteHash,
    chain: input.quote.chain,
    network: input.quote.network,
    wallet: input.quote.wallet,
    transfers: input.transfers,
    serviceFeeAtomic: input.quote.serviceFeeAtomic,
    issuedAt: input.quote.issuedAt,
    expiresAt: input.quote.expiresAt,
  };
  const intentHash = createHash("sha256").update(canonicalCheckoutIntentPayload(unsigned)).digest("hex");
  const intent = { ...unsigned, intentHash };
  validateCheckoutIntent(intent, new Date(Date.parse(intent.issuedAt)));
  return intent;
}
