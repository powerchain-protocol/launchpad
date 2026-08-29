import type { ClientWithCoreApi } from "@mysten/sui/client";
import {
  buildLaunchConfigureReview,
  buildTokenDeployReview,
  type GraduationAdapterSelection,
  type GraduationPreview,
  type LaunchDraft,
  type LaunchRecord,
  type LaunchSimulationResult,
  type PreparedTransaction,
  type VerificationResult,
} from "@powerchain/launchpad-domain/launch";
import {
  buildSuiConfigureLaunchTransaction,
  buildSuiPublishTokenTransaction,
  type CompiledMovePackage,
  type SuiDevBuyComposer,
  type SuiLaunchEnvironment,
} from "@powerchain/sui/launch";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import type { LaunchChainAdapter, LaunchConfigurationPreparationContext } from "./adapter";

export interface SuiTokenPackageDescriptor {
  moduleName: string;
  coinTypeName: string;
}

/**
 * Production implementations may compile a validated Move template in an
 * isolated worker or return a precompiled artifact from immutable storage.
 * Creator-authored Move source is intentionally outside this interface.
 */
export interface SuiTokenPackageProvider {
  describe(launch: LaunchDraft & { chain: "sui" }): Promise<SuiTokenPackageDescriptor>;
  compile(launch: LaunchDraft & { chain: "sui" }): Promise<CompiledMovePackage>;
}

export interface SuiGraduationPreviewProvider {
  preview(
    launch: LaunchRecord & { chain: "sui" },
    adapter: GraduationAdapterSelection,
  ): Promise<GraduationPreview>;
}

export interface SuiLaunchChainAdapterOptions {
  client: ClientWithCoreApi;
  environment: SuiLaunchEnvironment;
  tokenPackageProvider: SuiTokenPackageProvider;
  devBuyComposer?: SuiDevBuyComposer;
  graduationPreviewProvider?: SuiGraduationPreviewProvider;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" ? (value as UnknownRecord) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeAddress(value: string): string {
  const lower = value.toLowerCase();
  if (!lower.startsWith("0x")) return lower;
  const body = lower.slice(2).replace(/^0+/, "") || "0";
  return `0x${body}`;
}

function bytesToHex(value: unknown): string | undefined {
  if (Array.isArray(value) && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
    return value.map((item) => Number(item).toString(16).padStart(2, "0")).join("");
  }
  if (typeof value === "string") {
    const clean = value.startsWith("0x") ? value.slice(2) : value;
    return /^[a-f0-9]{64}$/i.test(clean) ? clean.toLowerCase() : undefined;
  }
  return undefined;
}

function objectTypeEntries(value: unknown): Array<[string, string]> {
  if (value instanceof Map) {
    return Array.from(value.entries()).flatMap(([key, type]) =>
      typeof key === "string" && typeof type === "string" ? [[key, type] as [string, string]] : [],
    );
  }
  const record = asRecord(value);
  if (!record) return [];
  return Object.entries(record).flatMap(([key, type]) =>
    typeof type === "string" ? [[key, type] as [string, string]] : [],
  );
}

function transactionPart(result: unknown): UnknownRecord | undefined {
  const record = asRecord(result);
  return asRecord(record?.Transaction) ?? asRecord(record?.FailedTransaction);
}

function transactionSucceeded(result: unknown): boolean {
  const transaction = transactionPart(result);
  const status = asRecord(transaction?.status);
  return status?.success === true;
}

function transactionDigest(result: unknown): string | undefined {
  return stringValue(transactionPart(result)?.digest);
}

function transactionEvents(result: unknown): UnknownRecord[] {
  const events = transactionPart(result)?.events;
  return Array.isArray(events) ? events.flatMap((event) => (asRecord(event) ? [asRecord(event)!] : [])) : [];
}

function transactionObjectTypes(result: unknown): Array<[string, string]> {
  return objectTypeEntries(transactionPart(result)?.objectTypes);
}

function eventJson(event: UnknownRecord): UnknownRecord | undefined {
  return asRecord(event.json);
}

function eventType(event: UnknownRecord): string | undefined {
  return stringValue(event.eventType) ?? stringValue(event.type);
}

function expectedVenueCode(venue: "cetus" | "deepbook" | "turbos"): number {
  return venue === "cetus" ? 0 : venue === "deepbook" ? 1 : 2;
}

function hashHex(value: string): string {
  return Array.from(sha256(utf8ToBytes(value)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export class SuiLaunchChainAdapter implements LaunchChainAdapter {
  constructor(private readonly options: SuiLaunchChainAdapterOptions) {
    if (!options.environment.launchpadPackageId.trim()) throw new Error("Sui launchpad package id is required.");
    if (!options.environment.feeVaultAddress.trim()) throw new Error("Sui launch fee vault is required.");
    if (!options.environment.graduationRegistryObjectId.trim()) throw new Error("Sui graduation registry object id is required.");
  }

  async prepareTokenDeployment(launch: LaunchDraft): Promise<PreparedTransaction> {
    if (launch.chain !== "sui") throw new Error("Sui adapter received a non-Sui launch.");
    const compiled = await this.options.tokenPackageProvider.compile(launch);
    const tx = buildSuiPublishTokenTransaction(launch.creatorWallet, compiled);
    const bytes = await tx.build({ client: this.options.client });
    const review = buildTokenDeployReview(launch);
    review.instructions.push({
      index: review.instructions.length,
      program: "Sui Package",
      action: "Make freshly published token package immutable",
      immutable: true,
    });
    return {
      launchId: launch.id,
      chain: "sui",
      stage: "TOKEN_DEPLOY",
      serialized: encodeBase64(bytes),
      encoding: "base64-bcs",
      review,
    };
  }

  async verifyTokenDeployment(launch: LaunchRecord, transactionId: string): Promise<VerificationResult> {
    if (launch.chain !== "sui") return this.notVerified(launch, "TOKEN_DEPLOY", transactionId, "Wrong chain adapter.");
    const result = await this.options.client.core.getTransaction({
      digest: transactionId,
      include: { effects: true, events: true, objectTypes: true },
    });
    if (!transactionSucceeded(result)) return this.notVerified(launch, "TOKEN_DEPLOY", transactionId, "Sui token deployment failed on-chain.");

    const descriptor = await this.options.tokenPackageProvider.describe(launch);
    const created = transactionEvents(result).find((event) => eventType(event)?.endsWith(`::${descriptor.moduleName}::TokenCreated`));
    const type = created ? eventType(created) : undefined;
    if (!type) return this.notVerified(launch, "TOKEN_DEPLOY", transactionId, "TokenCreated event was not emitted by Tx 1.");
    const packageId = type.split("::")[0];
    if (!packageId) return this.notVerified(launch, "TOKEN_DEPLOY", transactionId, "Unable to derive published package id.");

    const createdJson = eventJson(created!);
    const creator = stringValue(createdJson?.creator);
    if (creator && normalizeAddress(creator) !== normalizeAddress(launch.creatorWallet)) {
      return this.notVerified(launch, "TOKEN_DEPLOY", transactionId, "TokenCreated creator does not match the launch creator.");
    }

    const coinType = `${packageId}::${descriptor.moduleName}::${descriptor.coinTypeName}`;
    const { coinMetadata } = await this.options.client.core.getCoinMetadata({ coinType });
    if (!coinMetadata) return this.notVerified(launch, "TOKEN_DEPLOY", transactionId, "Published coin metadata is unavailable.");
    if (coinMetadata.name !== launch.token.name || coinMetadata.symbol !== launch.token.symbol || coinMetadata.decimals !== launch.token.decimals) {
      return this.notVerified(launch, "TOKEN_DEPLOY", transactionId, "Published Sui coin metadata does not match the reviewed token definition.");
    }

    const treasuryType = `0x2::coin::TreasuryCap<${coinType}>`;
    const treasuryCapObjectId = transactionObjectTypes(result).find(([, objectType]) => objectType === treasuryType)?.[0];
    if (!treasuryCapObjectId) {
      return this.notVerified(launch, "TOKEN_DEPLOY", transactionId, "Tx 1 did not create the expected TreasuryCap object.");
    }

    return {
      verified: true,
      transactionId: transactionDigest(result) ?? transactionId,
      chain: "sui",
      stage: "TOKEN_DEPLOY",
      tokenAddress: coinType,
      packageId,
      treasuryCapObjectId,
    };
  }

  async simulateLaunchConfiguration(
    launch: LaunchRecord,
    context: LaunchConfigurationPreparationContext,
  ): Promise<LaunchSimulationResult> {
    const suiLaunch = this.assertSuiLaunchReady(launch);
    const built = this.buildConfiguration(suiLaunch, context);
    const simulation = await this.options.client.core.simulateTransaction({
      transaction: built.transaction,
      include: { effects: true, balanceChanges: true, commandResults: true },
    });
    const success = transactionSucceeded(simulation);
    const transaction = transactionPart(simulation);
    const status = asRecord(transaction?.status);
    return {
      launchId: launch.id,
      chain: "sui",
      stage: "LAUNCH_CONFIG",
      configurationHash: context.reviewHash,
      expectedEffects: this.expectedEffects(suiLaunch, context.graduationAdapter),
      chainSimulation: {
        success,
        ...(success ? {} : { error: stringValue(status?.error) ?? "Sui simulation rejected Tx 2." }),
      },
      warnings: success ? [] : ["The Sui full node rejected the exact Tx 2 transaction during simulation."],
      simulatedAt: new Date().toISOString(),
    };
  }

  async prepareLaunchConfiguration(
    launch: LaunchRecord,
    context: LaunchConfigurationPreparationContext,
  ): Promise<PreparedTransaction> {
    const suiLaunch = this.assertSuiLaunchReady(launch);
    const built = this.buildConfiguration(suiLaunch, context);
    const bytes = await built.transaction.build({ client: this.options.client });
    return {
      launchId: launch.id,
      chain: "sui",
      stage: "LAUNCH_CONFIG",
      serialized: encodeBase64(bytes),
      encoding: "base64-bcs",
      review: buildLaunchConfigureReview(launch, {
        adapter: context.graduationAdapter,
        configurationHash: context.reviewHash,
      }),
    };
  }

  async verifyLaunchConfiguration(launch: LaunchRecord, transactionId: string): Promise<VerificationResult> {
    if (launch.chain !== "sui") return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Wrong chain adapter.");
    if (!launch.reviewHash || !launch.graduationAdapter) {
      return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Launch is missing its signed review/adapter commitment.");
    }
    const result = await this.options.client.core.getTransaction({
      digest: transactionId,
      include: { effects: true, events: true, objectTypes: true },
    });
    if (!transactionSucceeded(result)) return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Sui launch configuration failed on-chain.");

    const created = transactionEvents(result).find((event) => {
      const type = eventType(event);
      return type === `${this.options.environment.launchpadPackageId}::launchpad::LaunchCreated`;
    });
    if (!created) return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "LaunchCreated event is missing.");
    const json = eventJson(created);
    if (!json) return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "LaunchCreated event payload is unavailable.");

    const creator = stringValue(json.creator);
    if (!creator || normalizeAddress(creator) !== normalizeAddress(launch.creatorWallet)) {
      return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Launch creator mismatch.");
    }
    if (numberValue(json.graduation_venue) !== expectedVenueCode(launch.graduation.venue)) {
      return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Graduation venue mismatch.");
    }
    const registryId = stringValue(json.graduation_registry_id);
    if (!registryId || normalizeAddress(registryId) !== normalizeAddress(launch.graduationAdapter.registryId)) {
      return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Graduation registry mismatch.");
    }
    if (Number(json.graduation_adapter_version) !== launch.graduationAdapter.version) {
      return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Graduation adapter version mismatch.");
    }
    if (bytesToHex(json.graduation_adapter_id_hash) !== hashHex(launch.graduationAdapter.adapterId)) {
      return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Graduation adapter id commitment mismatch.");
    }
    if (bytesToHex(json.graduation_adapter_config_hash) !== launch.graduationAdapter.configHash?.toLowerCase()) {
      return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Graduation adapter configuration hash mismatch.");
    }
    const reviewHash = bytesToHex(json.review_hash);
    if (!reviewHash || reviewHash !== launch.reviewHash.toLowerCase()) {
      return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Submitted Tx 2 review hash does not match the signed configuration snapshot.");
    }

    const vestingAddress = launch.devBuy?.enabled && launch.devBuy.vesting?.enabled
      ? transactionObjectTypes(result).find(([, objectType]) => objectType.startsWith(`${this.options.environment.launchpadPackageId}::vesting::VestingLock<`))?.[0]
      : undefined;
    if (launch.devBuy?.enabled && launch.devBuy.vesting?.enabled && !vestingAddress) {
      return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Atomic dev-buy vesting was reviewed but no VestingLock object was created.");
    }

    return {
      verified: true,
      transactionId: transactionDigest(result) ?? transactionId,
      chain: "sui",
      stage: "LAUNCH_CONFIG",
      reviewHash,
      ...(vestingAddress ? { vestingAddress } : {}),
    };
  }

  async previewGraduation(
    launch: LaunchRecord,
    graduationAdapter: GraduationAdapterSelection,
  ): Promise<GraduationPreview> {
    if (launch.chain !== "sui") throw new Error("Sui adapter received a non-Sui launch.");
    if (this.options.graduationPreviewProvider) {
      return this.options.graduationPreviewProvider.preview(launch as LaunchRecord & { chain: "sui" }, graduationAdapter);
    }
    return {
      launchId: launch.id,
      chain: "sui",
      venue: launch.graduation.venue,
      adapter: graduationAdapter,
      poolParameters: [],
      assumptions: [],
      warnings: ["Venue adapter does not expose a graduation preview provider in this deployment."],
      observedAt: new Date().toISOString(),
    };
  }

  private buildConfiguration(
    launch: LaunchRecord & { chain: "sui"; tokenAddress: string; treasuryCapObjectId: string },
    context: LaunchConfigurationPreparationContext,
  ) {
    return buildSuiConfigureLaunchTransaction(
      launch,
      this.options.environment,
      launch.tokenAddress,
      launch.treasuryCapObjectId,
      context.graduationAdapter,
      context.reviewHash,
      this.options.devBuyComposer,
    );
  }

  private assertSuiLaunchReady(
    launch: LaunchRecord,
  ): LaunchRecord & { chain: "sui"; tokenAddress: string; treasuryCapObjectId: string } {
    if (launch.chain !== "sui") throw new Error("Sui adapter received a non-Sui launch.");
    if (!launch.tokenAddress) throw new Error("Sui Tx 1 verification has not persisted the coin type.");
    if (!launch.treasuryCapObjectId) throw new Error("Sui Tx 1 verification has not persisted the TreasuryCap object id.");
    return launch as LaunchRecord & { chain: "sui"; tokenAddress: string; treasuryCapObjectId: string };
  }

  private expectedEffects(
    launch: LaunchRecord & { chain: "sui" },
    adapter: GraduationAdapterSelection,
  ) {
    const devBuy = launch.devBuy?.enabled ? launch.devBuy : undefined;
    return {
      graduationVenue: launch.graduation.venue,
      graduationAdapter: adapter,
      payoutRecipients: launch.payoutSplits.length,
      antiBotDelaySeconds: launch.antiBot.enabled ? launch.antiBot.delaySeconds : 0,
      ...(launch.launchWindow ? { launchWindow: launch.launchWindow } : {}),
      ...(launch.initialPurchaseLimit ? { initialPurchaseLimit: launch.initialPurchaseLimit } : {}),
      ...(launch.eligibility ? { eligibility: launch.eligibility } : {}),
      ...(devBuy
        ? {
            devBuy: {
              enabled: true,
              amountAtomic: devBuy.amountAtomic,
              paymentAsset: devBuy.paymentAsset,
              routedToVesting: Boolean(devBuy.vesting?.enabled),
              ...(devBuy.vesting?.enabled ? { vestingTemplate: devBuy.vesting.template } : {}),
            },
          }
        : {}),
      launchFee: { asset: "SUI", amountAtomic: "2000000000" },
    };
  }

  private notVerified(
    launch: LaunchDraft,
    stage: "TOKEN_DEPLOY" | "LAUNCH_CONFIG",
    transactionId: string,
    reason: string,
  ): VerificationResult {
    return { verified: false, transactionId, chain: launch.chain, stage, reason };
  }
}
