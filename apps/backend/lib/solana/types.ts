import type { SolanaNetwork } from "@powerchain/launchpad-shared";

export type SolanaProgramKind =
  | "launchpad"
  | "vesting"
  | "graduation-registry"
  | "token-2022"
  | "powerpay-checkout"
  | "powerpay-settlements"
  | "powerpay-factory";

export type SolanaProgramCategory = "launchpad" | "powerpay" | "solana";
export type SolanaMarketSource = "pyth" | "coingecko" | "coinmarketcap" | "http" | "solana-rpc";

export interface SolanaRpcProviderHealth {
  provider: string;
  ok: boolean;
  clusterHealth: "ok" | "unknown" | "error";
  latencyMs: number;
  slot: number | null;
  blockHeight: number | null;
  coreVersion: string | null;
  latestBlockhash: string | null;
  lastValidBlockHeight: number | null;
  genesisHash: string | null;
  genesisHashMatchesExpected: boolean | null;
  error?: string;
}

export interface SolanaRpcHealthResponse {
  chain: "solana";
  network: SolanaNetwork;
  status: "ok" | "degraded" | "error";
  healthyProviders: number;
  providerCount: number;
  providers: SolanaRpcProviderHealth[];
  slot: number | null;
  blockHeight: number | null;
  coreVersion: string | null;
  latestBlockhash: string | null;
  lastValidBlockHeight: number | null;
  genesisHash: string | null;
  observedAt: string;
  authorityNotice: string;
}

export interface SolanaOverview {
  chain: "solana";
  network: SolanaNetwork;
  status: "ok" | "degraded" | "error";
  latencyMs: number;
  slot: number;
  blockHeight: number;
  epoch: number;
  epochSlotIndex: number;
  slotsInEpoch: number;
  absoluteSlot: number;
  transactionCount: number | null;
  coreVersion: string;
  latestBlockhash: string;
  lastValidBlockHeight: number;
  genesisHash: string | null;
  rpcProviderCount: number;
  healthyRpcProviders: number;
  configured: {
    launchpadProgram: boolean;
    vestingProgram: boolean;
    graduationRegistry: boolean;
    powerPayCheckoutProgram: boolean;
    powerPaySettlementsProgram: boolean;
    powerPayFactoryProgram: boolean;
    pwrcMint: boolean;
    usdcMint: boolean;
    treasury: boolean;
    serviceFeeRecipient: boolean;
  };
  observedAt: string;
  authorityNotice: string;
}

export interface SolanaProgramStatus {
  kind: SolanaProgramKind;
  category: SolanaProgramCategory;
  name: string;
  address: string | null;
  configured: boolean;
  required: boolean;
  exists: boolean;
  executable: boolean;
  executableRequired: boolean;
  placeholder: boolean;
  owner: string | null;
  lamports: string | null;
  explorerUrl: string | null;
  error?: string;
}

export interface SolanaProgramsResponse {
  chain: "solana";
  network: SolanaNetwork;
  programs: SolanaProgramStatus[];
  allConfigured: boolean;
  allRequiredDeploymentsVerified: boolean;
  powerPayConfigured: boolean;
  powerPayVerified: boolean;
  observedAt: string;
}

export interface SolanaTokenExtensionSummary {
  type: string;
  details: Record<string, unknown>;
}

export interface SolanaTokenMetadataSummary {
  name: string | null;
  symbol: string | null;
  uri: string | null;
  updateAuthority: string | null;
  additionalMetadata: Array<[string, string]>;
}

export interface SolanaPowerPayMintCompatibility {
  status: "standard" | "extension-aware" | "unsupported" | "unknown";
  configuredAsPwrc: boolean;
  configuredAsUsdc: boolean;
  reasons: string[];
}

export interface SolanaAssetResponse {
  chain: "solana";
  network: SolanaNetwork;
  mint: string;
  exists: boolean;
  tokenProgram: "spl-token" | "token-2022" | "unknown";
  ownerProgram: string | null;
  decimals: number | null;
  supplyAtomic: string | null;
  supplyUi: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  isInitialized: boolean | null;
  extensions: SolanaTokenExtensionSummary[];
  extensionTypes: string[];
  metadata: SolanaTokenMetadataSummary | null;
  capabilities: {
    mintAuthorityActive: boolean;
    freezeAuthorityActive: boolean;
    transferFee: boolean;
    transferHook: boolean;
    permanentDelegate: boolean;
    nonTransferable: boolean;
    confidentialTransfer: boolean;
    interestBearing: boolean;
    defaultAccountState: boolean;
    metadataPointer: boolean;
  };
  powerPay: SolanaPowerPayMintCompatibility;
  largestAccounts: Array<{
    address: string;
    amountAtomic: string;
    amountUi: string | null;
    decimals: number;
  }>;
  explorerUrl: string;
  observedAt: string;
}

export interface SolanaExternalMarketData {
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceChange24hPercent: number | null;
  holderCount: number | null;
  priceConfidenceUsd: number | null;
  pricePublishTime: string | null;
  source: SolanaMarketSource | string;
  observedAt: string;
}

export interface SolanaMarketProviderObservation {
  source: SolanaMarketSource | string;
  available: boolean;
  contributed: string[];
  observedAt?: string;
  error?: string;
}

export interface SolanaResolvedMarketData extends SolanaExternalMarketData {
  sources: string[];
  observations: SolanaMarketProviderObservation[];
}

export interface SolanaMarketResponse {
  chain: "solana";
  network: SolanaNetwork;
  mint: string;
  supplyAtomic: string | null;
  supplyUi: string | null;
  decimals: number | null;
  tokenProgram: SolanaAssetResponse["tokenProgram"];
  mintAuthority: string | null;
  freezeAuthority: string | null;
  extensionTypes: string[];
  extensions: SolanaTokenExtensionSummary[];
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceChange24hPercent: number | null;
  holderCount: number | null;
  priceConfidenceUsd: number | null;
  priceConfidencePercent: number | null;
  pricePublishTime: string | null;
  priceAgeSeconds: number | null;
  priceStale: boolean | null;
  source: string;
  sources: string[];
  providerObservations: SolanaMarketProviderObservation[];
  observedAt: string;
  marketDataAvailable: boolean;
  marketDataError?: string;
  explorerUrl: string;
}

export interface SolanaCreatorTokenAccount {
  account: string;
  mint: string;
  tokenProgram: "spl-token" | "token-2022";
  amountAtomic: string;
  amountUi: string | null;
  decimals: number;
}

export interface SolanaCreatorResponse {
  chain: "solana";
  network: SolanaNetwork;
  wallet: string;
  accountExists: boolean;
  lamports: string;
  sol: string;
  ownerProgram: string | null;
  executable: boolean;
  tokenAccountCount: number;
  tokenAccounts: SolanaCreatorTokenAccount[];
  powerPay: {
    pwrcMint: string | null;
    pwrcBalanceAtomic: string | null;
    pwrcBalanceUi: string | null;
    usdcMint: string | null;
    usdcBalanceAtomic: string | null;
    usdcBalanceUi: string | null;
    isTreasury: boolean;
    isServiceFeeRecipient: boolean;
  };
  explorerUrl: string;
  observedAt: string;
}

export interface SolanaMarketDataProvider {
  readonly id?: string;
  getMarket(mint: string): Promise<SolanaExternalMarketData | null>;
}
