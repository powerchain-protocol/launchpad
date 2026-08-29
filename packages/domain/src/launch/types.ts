import type { GraduationVenue, LaunchChain } from "./chains";

export type LaunchStatus =
  | "DRAFT"
  | "TOKEN_DEPLOY_PENDING"
  | "TOKEN_DEPLOYED"
  | "LAUNCH_CONFIG_PENDING"
  | "LIVE"
  | "GRADUATION_READY"
  | "GRADUATING"
  | "GRADUATED"
  | "FAILED";

export type TransactionStage = "TOKEN_DEPLOY" | "LAUNCH_CONFIG" | "GRADUATION";
export type EligibilityMode = "public" | "allowlist" | "private";
export type ConfigurationHashAlgorithm = "sha256";
export type ConfigurationSignatureAlgorithm = "ed25519";

export interface TokenDefinition {
  name: string;
  symbol: string;
  description: string;
  iconUri: string;
  decimals: number;
}

export interface PayoutSplit {
  recipient: string;
  basisPoints: number;
  label?: string;
}

export interface AntiBotConfig {
  enabled: boolean;
  delaySeconds: number;
}

export interface InitialPurchaseLimitConfig {
  enabled: boolean;
  maxPerWalletAtomic?: string;
}

export interface LaunchWindowConfig {
  enabled: boolean;
  opensAt?: string;
  closesAt?: string;
}

/**
 * References the existing PowerChain eligibility architecture rather than
 * creating a second allowlist implementation inside Launchpad.
 */
export interface LaunchEligibilityConfig {
  mode: EligibilityMode;
  policyId?: string;
  /** Merkle root / policy commitment or equivalent immutable policy digest. */
  commitment?: string;
}

export interface LinearVestingSchedule {
  kind: "linear";
  cliffSeconds: number;
  durationSeconds: number;
}

export interface ProgressiveVestingTranche {
  unlockOffsetSeconds: number;
  /** Incremental basis points unlocked at this tranche. All tranches sum to 10,000. */
  basisPoints: number;
}

export interface ProgressiveVestingSchedule {
  kind: "progressive";
  tranches: ProgressiveVestingTranche[];
}

export type VestingSchedule = LinearVestingSchedule | ProgressiveVestingSchedule;

export interface VestingTemplate {
  id?: string;
  name: string;
  schedule: VestingSchedule;
}

export interface DevVestingConfig {
  enabled: boolean;
  template: VestingTemplate;
}

export interface DevBuyConfig {
  enabled: boolean;
  amountAtomic: string;
  paymentAsset: string;
  vesting?: DevVestingConfig;
}

export interface CurveConfig {
  kind: "bonding-curve";
  initialPriceAtomic: string;
  graduationThresholdAtomic: string;
}

export interface GraduationAdapterSelection {
  registryId: string;
  adapterId: string;
  version: number;
  /** Optional chain address/object/account for the approved registry entry. */
  registryEntryAddress?: string;
  configHash?: string;
}

export interface LaunchDraft {
  id: string;
  chain: LaunchChain;
  creatorWallet: string;
  token: TokenDefinition;
  curve: CurveConfig;
  payoutSplits: PayoutSplit[];
  graduation: GraduationVenue;
  antiBot: AntiBotConfig;
  devBuy?: DevBuyConfig;
  initialPurchaseLimit?: InitialPurchaseLimitConfig;
  launchWindow?: LaunchWindowConfig;
  eligibility?: LaunchEligibilityConfig;
}

export interface LaunchRecord extends LaunchDraft {
  status: LaunchStatus;
  graduationVenueLocked: boolean;
  tokenAddress?: string;
  packageId?: string;
  treasuryCapObjectId?: string;
  tokenDeployTx?: string;
  configureTx?: string;
  vestingAddress?: string;
  graduationAdapter?: GraduationAdapterSelection;
  reviewHash?: string;
  reviewSignature?: string;
  reviewKeyId?: string;
  createdAt: string;
  updatedAt: string;
  launchedAt?: string;
}

export interface ConfigurationReviewSnapshot {
  launchId: string;
  chain: LaunchChain;
  stage: "LAUNCH_CONFIG";
  hashAlgorithm: ConfigurationHashAlgorithm;
  hash: string;
  signatureAlgorithm: ConfigurationSignatureAlgorithm;
  signature: string;
  keyId: string;
  canonicalPayload: string;
  createdAt: string;
}

export interface ExpectedTx2Effects {
  graduationVenue: GraduationVenue["venue"];
  graduationAdapter: GraduationAdapterSelection;
  payoutRecipients: number;
  antiBotDelaySeconds: number;
  launchWindow?: LaunchWindowConfig;
  initialPurchaseLimit?: InitialPurchaseLimitConfig;
  eligibility?: LaunchEligibilityConfig;
  devBuy?: {
    enabled: boolean;
    amountAtomic: string;
    paymentAsset: string;
    routedToVesting: boolean;
    vestingTemplate?: VestingTemplate;
  };
  launchFee?: { asset: string; amountAtomic: string };
}

export interface LaunchSimulationResult {
  launchId: string;
  chain: LaunchChain;
  stage: "LAUNCH_CONFIG";
  configurationHash: string;
  expectedEffects: ExpectedTx2Effects;
  chainSimulation?: {
    success: boolean;
    computeOrGasUsed?: string;
    estimatedNetworkFeeAtomic?: string;
    logs?: string[];
    error?: string;
  };
  warnings: string[];
  simulatedAt: string;
}

export interface GraduationPoolParameter {
  key: string;
  value: string;
  source: "adapter" | "creator" | "derived";
}

export interface GraduationPreview {
  launchId: string;
  chain: LaunchChain;
  venue: GraduationVenue["venue"];
  adapter: GraduationAdapterSelection;
  estimatedInitialLiquidity?: {
    baseAtomic?: string;
    quoteAtomic?: string;
    quoteAsset?: string;
    usdMicros?: string;
  };
  poolParameters: GraduationPoolParameter[];
  assumptions: string[];
  warnings: string[];
  observedAt: string;
}

export interface ChainLaunchAnalyticsInput {
  launchId: string;
  chain: LaunchChain;
  quoteVolumeAtomic: string;
  quoteDecimals: number;
  quoteUsdPriceMicros?: string;
  holders: number;
  soldAtomic: string;
  graduationThresholdAtomic: string;
  observedAt: string;
  source: string;
}

export interface NormalizedLaunchAnalytics {
  launchId: string;
  chain: LaunchChain;
  volumeQuote: string;
  volumeUsdMicros?: string;
  holders: number;
  curveProgressBps: number;
  observedAt: string;
  source: string;
}

export interface PreparedTransaction {
  launchId: string;
  chain: LaunchChain;
  stage: Exclude<TransactionStage, "GRADUATION">;
  serialized: string;
  encoding: "base64" | "base64-bcs";
  expiresAt?: string;
  review: TransactionReview;
  reviewSnapshot?: ConfigurationReviewSnapshot;
}

export interface VerificationResult {
  verified: boolean;
  transactionId: string;
  chain: LaunchChain;
  stage: Exclude<TransactionStage, "GRADUATION">;
  tokenAddress?: string;
  packageId?: string;
  treasuryCapObjectId?: string;
  vestingAddress?: string;
  blockOrCheckpoint?: string;
  /** Hash extracted from the actual submitted Tx 2 / resulting on-chain launch state. */
  reviewHash?: string;
  reason?: string;
}

export interface ReviewInstruction {
  index: number;
  program: string;
  action: string;
  accounts?: string[];
  value?: string;
  immutable?: boolean;
}

export interface TransactionReview {
  chain: LaunchChain;
  stage: Exclude<TransactionStage, "GRADUATION">;
  title: string;
  wallet: string;
  feeSummary: Array<{ label: string; amount: string }>;
  immutableFacts: string[];
  instructions: ReviewInstruction[];
  configurationHash?: string;
}
