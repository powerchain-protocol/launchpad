import { createHash } from "node:crypto";
import {
  canonicalCheckoutQuotePayload,
  validateCheckoutQuoteCommitment,
  type BoundCheckoutQuote,
  type CheckoutQuoteCommitment,
} from "@powerchain/launchpad-domain/checkout";

export function bindCheckoutQuote(input: CheckoutQuoteCommitment): BoundCheckoutQuote {
  validateCheckoutQuoteCommitment(input);
  const quoteHash = createHash("sha256")
    .update(canonicalCheckoutQuotePayload(input), "utf8")
    .digest("hex");
  return { ...input, quoteHash };
}
