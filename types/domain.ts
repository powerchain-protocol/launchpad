export type SaleStage = "DRAFT" | "SCHEDULED" | "LIVE" | "ENDED" | "CLAIMING" | "COMPLETED";
export type TxStatus = "CREATED" | "AWAITING_SIGNATURE" | "SUBMITTED" | "VALIDATING" | "VALIDATED" | "FAILED";
export type PaymentAsset = "SOL" | "USDC" | "PWRC";
export type QuoteKind = "PAYMENT" | "TOKEN_PURCHASE";

export type PoolVenue = "RAYDIUM_CPMM" | "METEORA_DAMM_V2" | "ORCA_WHIRLPOOL";
export type PoolStatus = "DRAFT" | "SCHEDULED" | "READY" | "CREATING" | "LIVE" | "GRADUATED" | "FAILED" | "CLOSED";
export type PoolMode = "SALE_GRADUATION" | "MANUAL";

export type SaleTier = {
  id: string;
  name: string;
  minAmount: number;
  maxAmount: number;
  bonusBps: number;
  enabled: boolean;
};

export type Sale = {
  id: string;
  name: string;
  symbol: string;
  mint: string;
  authority: string;
  decimals: number;
  merchantWallet: string;
  priceUsd: number;
  hardCap: number;
  sold: number;
  soldBaseUnits: string;
  startsAt: string;
  endsAt: string;
  claimAt: string;
  stage: SaleStage;
  validated: boolean;
  updatedAt: string;
  revision: number;
  acceptedAssets?: PaymentAsset[];
  tiers?: SaleTier[];
};

export type LaunchPool = {
  id: string;
  name: string;
  mode: PoolMode;
  saleId?: string;
  baseMint: string;
  baseSymbol: string;
  baseDecimals: number;
  quoteMint: string;
  quoteSymbol: string;
  quoteDecimals: number;
  venue: PoolVenue;
  status: PoolStatus;
  authority: string;
  treasuryWallet: string;
  initialBaseAmount: string;
  initialQuoteAmount: string;
  feeTierBps?: number;
  launchAt?: string;
  graduationThresholdBps: number;
  poolAddress?: string;
  lpMint?: string;
  creationSignature?: string;
  validated: boolean;
  reviewHash?: string;
  reviewedAt?: string;
  reviewAdapterVersion?: string;
  reviewedBy?: string;
  reviewConfigurationRevision?: number;
  revision: number;
  configurationRevision: number;
  createdAt: string;
  updatedAt: string;
};

export type PoolReview = {
  poolId: string;
  venue: PoolVenue;
  adapterConfigured: boolean;
  adapterVersion: string | null;
  configurationValid: boolean;
  reviewCurrent: boolean;
  ready: boolean;
  configurationBlockers: string[];
  blockers: string[];
  reviewHash: string;
  approvedReviewHash?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  revision: number;
  configurationRevision: number;
  approvedConfigurationRevision?: number;
  generatedAt: string;
};


export type PoolExecutionReadiness = {
  poolId: string;
  executable: boolean;
  failClosed: boolean;
  blockers: string[];
  status: PoolStatus;
  reviewReady: boolean;
  launchTimeReached: boolean;
  graduationRequired: boolean;
  graduationReached: boolean | null;
  adapterConfigured: boolean;
  adapterVersion: string | null;
  adapterImplementationAvailable: boolean;
  configurationRevision: number;
  generatedAt: string;
};

export type QuoteRecord = {
  id: string;
  idempotencyKey: string;
  requestHash: string;
  kind: QuoteKind;
  saleId?: string;
  payer?: string;
  recipient: string;
  feeTreasury: string;
  asset: PaymentAsset;
  mint?: string;
  amount: string;
  serviceFee: string;
  totalDebit: string;
  merchantReceives?: string;
  serviceFeeBps: number;
  feeMechanism: "explicit-platform-transfer" | "token-2022-transfer-fee-extension";
  tokenAmount?: string;
  quoteHash: string;
  createdAt: string;
  expiresAt: string;
  settledAt?: string;
  transactionId?: string;
};

export type TransactionRecord = {
  id: string;
  intentId?: string;
  quoteId?: string;
  quoteHash?: string;
  kind: "PAYMENT" | "TOKEN_PURCHASE" | "CLAIM" | "SEND" | "RECEIVE" | "POOL_CREATE";
  payer: string;
  recipient: string;
  mint?: string;
  asset?: string;
  amount: string;
  serviceFee: string;
  networkFeeLamports?: number;
  signature?: string;
  status: TxStatus;
  createdAt: string;
  validatedAt?: string;
  failureReason?: string;
};

export type TransactionIntent = {
  id: string;
  kind: TransactionRecord["kind"];
  payer: string;
  recipient: string;
  mint?: string;
  amount: string;
  serviceFee: string;
  quoteId?: string;
  quoteHash?: string;
  saleId?: string;
  tokenAmount?: string;
  messageHash: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  signature?: string;
};

export type AuthChallenge = {
  id: string;
  address: string;
  purpose: string;
  nonce: string;
  message: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
};

export type PurchaseRecord = {
  id: string;
  quoteId?: string;
  transactionId: string;
  saleId: string;
  buyer: string;
  paymentAsset: PaymentAsset;
  paymentAmount?: string;
  tokenAmount: string;
  createdAt: string;
};

export type ClaimAllocation = {
  saleId: string;
  wallet: string;
  purchased: string;
  claimed: string;
  updatedAt: string;
};

export type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  subject?: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};
