import type { CheckoutAsset, CheckoutNetwork } from "@powerchain/launchpad-domain/checkout";

export interface QuotePricingRequest {
  chain: "solana" | "sui";
  network: CheckoutNetwork;
  paymentAsset: CheckoutAsset;
  paymentAmountAtomic: string;
  receiveMintOrType: string;
}

export interface QuotePricingResult {
  receiveAmountAtomic: string;
  source: string;
  observedAt: string;
}

export interface QuotePricingProvider {
  quote(input: QuotePricingRequest): Promise<QuotePricingResult>;
}

let pricingProvider: QuotePricingProvider | undefined;

export function configureQuotePricing(provider: QuotePricingProvider): void {
  pricingProvider = provider;
}

export function getQuotePricing(): QuotePricingProvider {
  if (!pricingProvider) throw new Error("Checkout pricing provider is not configured.");
  return pricingProvider;
}
