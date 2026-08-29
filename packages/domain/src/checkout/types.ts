import type { LaunchChain } from "../launch/chains";

export type SolanaNetwork = "devnet" | "mainnet-beta";
export type SuiNetwork = "testnet" | "mainnet";
export type CheckoutNetwork = SolanaNetwork | SuiNetwork;
export type CheckoutAsset = "SOL" | "USDC" | "SUI";

export type RuntimeMode = "READ_ONLY" | "SIMULATION" | "LIVE" | "MAINTENANCE";

export interface RuntimeChainReadiness {
  chain: LaunchChain;
  network: CheckoutNetwork;
  ready: boolean;
  transferEnabled: boolean;
  checks: Array<{
    id: string;
    ok: boolean;
    required: boolean;
    detail: string;
  }>;
}

export interface RuntimeReadinessReport {
  mode: RuntimeMode;
  liveTransfersEnabled: boolean;
  generatedAt: string;
  chains: RuntimeChainReadiness[];
  blockers: string[];
}

export interface CheckoutQuoteCommitment {
  version: 1;
  quoteId: string;
  chain: LaunchChain;
  network: CheckoutNetwork;
  wallet: string;
  paymentAsset: CheckoutAsset;
  paymentAmountAtomic: string;
  receiveMintOrType: string;
  receiveAmountAtomic: string;
  treasuryAddress: string;
  serviceFeeAtomic: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

export interface BoundCheckoutQuote extends CheckoutQuoteCommitment {
  quoteHash: string;
}

export type SettlementState =
  | "CREATED"
  | "QUOTED"
  | "AWAITING_SIGNATURE"
  | "SUBMITTED"
  | "CONFIRMING"
  | "EXECUTION_UNKNOWN"
  | "SETTLED"
  | "RECONCILED"
  | "RECEIPTED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED"
  | "REJECTED";

export interface CheckoutIntentTransfer {
  recipient: string;
  asset: CheckoutAsset | string;
  amountAtomic: string;
}

export interface CheckoutTransactionIntent {
  version: 1;
  orderId: string;
  quoteId: string;
  quoteHash: string;
  chain: LaunchChain;
  network: CheckoutNetwork;
  wallet: string;
  transfers: CheckoutIntentTransfer[];
  serviceFeeAtomic: string;
  issuedAt: string;
  expiresAt: string;
  intentHash: string;
}

export interface ParsedTransactionEffects {
  chain: LaunchChain;
  network: CheckoutNetwork;
  wallet: string;
  transactionId: string;
  transfers: CheckoutIntentTransfer[];
  quoteHash?: string;
}

export interface SettlementEvidence {
  orderId: string;
  quoteId: string;
  state: SettlementState;
  chain: LaunchChain;
  network: CheckoutNetwork;
  wallet: string;
  quoteHash: string;
  transactionId?: string;
  blockOrCheckpoint?: string;
  submittedAt?: string;
  verifiedAt?: string;
  reconciledAt?: string;
  receiptId?: string;
  lastRpcError?: string;
  reconciliationAttempts?: number;
  lastReconciledAt?: string;
  updatedAt: string;
}

export interface SolanaSubmissionContext {
  chain: "solana";
  blockhash: string;
  lastValidBlockHeight: number;
}

export interface SuiSubmissionContext {
  chain: "sui";
  epoch?: string;
}

export type ChainSubmissionContext = SolanaSubmissionContext | SuiSubmissionContext;


export type RpcObservationStatus = "SETTLED" | "ABSENT" | "UNKNOWN" | "REJECTED";

export interface RpcSettlementObservation {
  providerId: string;
  status: RpcObservationStatus;
  transactionId?: string;
  blockOrCheckpoint?: string;
  reason?: string;
  observedAt: string;
}

export interface RpcQuorumDecision {
  status: RpcObservationStatus;
  transactionId?: string;
  blockOrCheckpoint?: string;
  reason?: string;
  observations: RpcSettlementObservation[];
}
