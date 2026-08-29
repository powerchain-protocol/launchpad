export type SuiNetwork = "mainnet" | "testnet" | "devnet" | "localnet";

export interface SuiRpcProviderHealth {
  provider: string;
  ok: boolean;
  latencyMs: number;
  chainIdentifier: string | null;
  checkpointHeight: string | null;
  epoch: string | null;
  referenceGasPrice: string | null;
  protocolVersion: string | null;
  error?: string;
}

export interface SuiOverviewResponse {
  chain: "sui";
  network: SuiNetwork;
  status: "ok" | "degraded" | "error";
  healthyProviders: number;
  providerCount: number;
  providers: SuiRpcProviderHealth[];
  chainIdentifier: string | null;
  checkpointHeight: string | null;
  epoch: string | null;
  referenceGasPrice: string | null;
  protocolVersion: string | null;
  epochStartTimestampMs: string | null;
  epochDurationMs: string | null;
  configured: {
    launchpadPackage: boolean;
    feeVault: boolean;
    graduationRegistry: boolean;
  };
  observedAt: string;
  authorityNotice: string;
}

export interface SuiPackageStatus {
  kind: "package";
  name: string;
  packageId: string | null;
  configured: boolean;
  required: boolean;
  exists: boolean;
  version: string | null;
  digest: string | null;
  modules: string[];
  explorerUrl: string | null;
  error?: string;
}

export interface SuiObjectStatus {
  kind: "object";
  name: string;
  objectId: string | null;
  configured: boolean;
  required: boolean;
  exists: boolean;
  objectType: string | null;
  version: string | null;
  digest: string | null;
  owner: string | null;
  explorerUrl: string | null;
  error?: string;
}

export interface SuiPackagesResponse {
  chain: "sui";
  network: SuiNetwork;
  packages: SuiPackageStatus[];
  objects: SuiObjectStatus[];
  allConfigured: boolean;
  allRequiredDeploymentsVerified: boolean;
  observedAt: string;
}

export interface SuiCoinMetadataSummary {
  id: string | null;
  name: string | null;
  symbol: string | null;
  description: string | null;
  iconUrl: string | null;
  decimals: number | null;
  metadataCapId: string | null;
  metadataCapState: string | null;
}

export interface SuiRegulatedMetadataSummary {
  id: string | null;
  coinMetadataObject: string | null;
  denyCapObject: string | null;
  allowGlobalPause: boolean | null;
  state: string | null;
}

export interface SuiAssetResponse {
  chain: "sui";
  network: SuiNetwork;
  coinType: string;
  packageId: string;
  module: string;
  typeName: string;
  exists: boolean;
  metadata: SuiCoinMetadataSummary | null;
  decimals: number | null;
  supplyAtomic: string | null;
  supplyUi: string | null;
  supplyState: string | null;
  treasuryCapObjectId: string | null;
  regulatedMetadata: SuiRegulatedMetadataSummary | null;
  capabilities: {
    metadataRegistered: boolean;
    supplyKnown: boolean;
    supplyFixed: boolean;
    burnOnly: boolean;
    regulated: boolean;
    globallyPausable: boolean;
  };
  packageExplorerUrl: string;
  observedAt: string;
}

export interface SuiExternalMarketData {
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceChange24hPercent: number | null;
  holderCount: number | null;
  source: string;
  observedAt: string;
}

export interface SuiMarketResponse {
  chain: "sui";
  network: SuiNetwork;
  coinType: string;
  supplyAtomic: string | null;
  supplyUi: string | null;
  decimals: number | null;
  symbol: string | null;
  name: string | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceChange24hPercent: number | null;
  holderCount: number | null;
  source: string;
  sources: string[];
  observedAt: string;
  marketDataAvailable: boolean;
  marketDataError?: string;
  packageExplorerUrl: string;
}

export interface SuiMarketDataProvider {
  readonly id?: string;
  getMarket(coinType: string): Promise<SuiExternalMarketData | null>;
}
