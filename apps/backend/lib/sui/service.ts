import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { loadRuntimeConfig } from "@powerchain/launchpad-config";
import { AppError, RPC_HEALTH_TIMEOUT_MS, suiExplorerObject } from "@powerchain/launchpad-shared";
import { SuiGrpcFallback } from "@powerchain/sui";
import type {
  SuiAssetResponse,
  SuiCoinMetadataSummary,
  SuiMarketDataProvider,
  SuiMarketResponse,
  SuiObjectStatus,
  SuiOverviewResponse,
  SuiPackageStatus,
  SuiPackagesResponse,
  SuiRegulatedMetadataSummary,
  SuiRpcProviderHealth,
} from "./types";

const AUTHORITY_NOTICE =
  "This endpoint reports read-network state only. Changing a Sui gRPC/read endpoint cannot change configured fee vault, package, graduation registry, treasury capability, or settlement authority.";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}
function integer(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "bigint" && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) ? parsed : null;
}
function bool(value: unknown): boolean | null { return typeof value === "boolean" ? value : null; }
function nested(value: unknown, key: string): Record<string, unknown> | null { return record(record(value)?.[key]); }

function normalizeAddress(value: string): string {
  const match = /^0x([0-9a-fA-F]{1,64})$/.exec(value.trim());
  if (!match) throw new AppError("BAD_REQUEST", "Sui address must be a 0x-prefixed hexadecimal address.", 400);
  return `0x${match[1].toLowerCase().padStart(64, "0")}`;
}

function parseCoinType(value: string): { coinType: string; packageId: string; module: string; typeName: string } {
  const raw = value.trim();
  if (!raw || raw.length > 512) throw new AppError("BAD_REQUEST", "coinType is required and must be at most 512 characters.", 400);
  const parts = raw.split("::");
  if (parts.length !== 3 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(parts[1] ?? "") || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(parts[2] ?? "")) {
    throw new AppError("BAD_REQUEST", "coinType must use <package>::<module>::<type> format.", 400);
  }
  const packageId = normalizeAddress(parts[0]);
  return { coinType: `${packageId}::${parts[1]}::${parts[2]}`, packageId, module: parts[1], typeName: parts[2] };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = RPC_HEALTH_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new AppError("RPC_ERROR", `Sui gRPC exceeded ${timeoutMs}ms.`, 503, { retryable: true })), timeoutMs);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

function unwrapResponse(value: unknown): Record<string, unknown> {
  const outer = record(value) ?? {};
  return record(outer.response) ?? outer;
}

function normalizeOwner(value: unknown): string | null {
  const owner = record(value);
  if (!owner) return text(value);
  return text(owner.AddressOwner) ?? text(owner.addressOwner) ?? text(owner.ObjectOwner) ?? text(owner.objectOwner) ?? text(owner.Shared) ?? text(owner.shared) ?? text(owner.$kind);
}

function atomicToUi(amount: bigint, decimals: number): string {
  if (decimals <= 0) return amount.toString();
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = (amount % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

function metadataSummary(value: unknown): SuiCoinMetadataSummary | null {
  const metadata = record(value);
  if (!metadata) return null;
  return {
    id: text(metadata.id) ?? text(metadata.objectId),
    name: text(metadata.name),
    symbol: text(metadata.symbol),
    description: text(metadata.description),
    iconUrl: text(metadata.iconUrl) ?? text(metadata.iconURL),
    decimals: integer(metadata.decimals),
    metadataCapId: text(metadata.metadataCapId),
    metadataCapState: text(metadata.metadataCapState),
  };
}

function regulatedSummary(value: unknown): SuiRegulatedMetadataSummary | null {
  const regulated = record(value);
  if (!regulated) return null;
  return {
    id: text(regulated.id),
    coinMetadataObject: text(regulated.coinMetadataObject),
    denyCapObject: text(regulated.denyCapObject),
    allowGlobalPause: bool(regulated.allowGlobalPause),
    state: text(regulated.coinRegulatedState) ?? text(regulated.state),
  };
}

function moduleNames(value: unknown): string[] {
  const pkg = record(value);
  const modules = pkg?.modules;
  if (!Array.isArray(modules)) return [];
  return modules.flatMap((item) => {
    if (typeof item === "string") return item.trim() ? [item.trim()] : [];
    const name = text(record(item)?.name);
    return name ? [name] : [];
  });
}

export class SuiReadService {
  private readonly rpc: SuiGrpcFallback;

  constructor(
    network: SuiOverviewResponse["network"],
    grpcUrls: string[],
    private readonly marketProvider?: SuiMarketDataProvider,
  ) {
    this.rpc = new SuiGrpcFallback(network, grpcUrls);
  }

  async overview(): Promise<SuiOverviewResponse> {
    const config = loadRuntimeConfig();
    const providers = await Promise.all(this.rpc.clients.map(async (client, index): Promise<SuiRpcProviderHealth> => {
      const started = performance.now();
      try {
        const [chainResult, gasResult, systemResult, protocolResult, serviceInfoResult, epochResult] = await withTimeout(Promise.all([
          client.core.getChainIdentifier(),
          client.core.getReferenceGasPrice(),
          client.core.getCurrentSystemState(),
          client.core.getProtocolConfig(),
          client.ledgerService.getServiceInfo({}),
          client.ledgerService.getEpoch({}),
        ]));
        const chain = record(chainResult);
        const gas = record(gasResult);
        const system = record(record(systemResult)?.systemState) ?? record(systemResult);
        const protocol = record(record(protocolResult)?.protocolConfig) ?? record(protocolResult);
        const info = unwrapResponse(serviceInfoResult);
        const epoch = unwrapResponse(epochResult);
        return {
          provider: `grpc-${index + 1}`,
          ok: true,
          latencyMs: Math.round(performance.now() - started),
          chainIdentifier: text(chain?.chainIdentifier),
          checkpointHeight: text(info.checkpointHeight),
          epoch: text(epoch.epoch) ?? text(system?.epoch),
          referenceGasPrice: text(gas?.referenceGasPrice),
          protocolVersion: text(protocol?.protocolVersion) ?? text(epoch.protocolVersion),
        };
      } catch (error) {
        return {
          provider: `grpc-${index + 1}`,
          ok: false,
          latencyMs: Math.round(performance.now() - started),
          chainIdentifier: null,
          checkpointHeight: null,
          epoch: null,
          referenceGasPrice: null,
          protocolVersion: null,
          error: error instanceof Error ? error.message : "Sui gRPC health check failed.",
        };
      }
    }));

    const healthy = providers.filter((provider) => provider.ok);
    const primary = healthy[0] ?? providers[0];
    let system: Record<string, unknown> | null = null;
    if (healthy.length) {
      try {
        system = await this.rpc.run(async (client) => {
          const result = await withTimeout(client.core.getCurrentSystemState());
          return record(record(result)?.systemState) ?? record(result);
        });
      } catch { system = null; }
    }

    return {
      chain: "sui",
      network: config.sui.network,
      status: healthy.length === providers.length && healthy.length > 0 ? "ok" : healthy.length > 0 ? "degraded" : "error",
      healthyProviders: healthy.length,
      providerCount: providers.length,
      providers,
      chainIdentifier: primary?.chainIdentifier ?? null,
      checkpointHeight: primary?.checkpointHeight ?? null,
      epoch: primary?.epoch ?? null,
      referenceGasPrice: primary?.referenceGasPrice ?? null,
      protocolVersion: primary?.protocolVersion ?? null,
      epochStartTimestampMs: text(system?.epochStartTimestampMs),
      epochDurationMs: text(system?.epochDurationMs),
      configured: {
        launchpadPackage: Boolean(config.sui.launchpadPackageId),
        feeVault: Boolean(config.sui.feeVault),
        graduationRegistry: Boolean(config.sui.graduationRegistryObjectId),
      },
      observedAt: new Date().toISOString(),
      authorityNotice: AUTHORITY_NOTICE,
    };
  }

  private async packageStatus(name: string, packageId: string | undefined, required: boolean): Promise<SuiPackageStatus> {
    const config = loadRuntimeConfig();
    const address = packageId?.trim() || null;
    if (!address) {
      return { kind: "package", name, packageId: null, configured: false, required, exists: false, version: null, digest: null, modules: [], explorerUrl: null };
    }
    let normalized: string;
    try { normalized = normalizeAddress(address); }
    catch (error) {
      return { kind: "package", name, packageId: address, configured: true, required, exists: false, version: null, digest: null, modules: [], explorerUrl: null, error: error instanceof Error ? error.message : "Invalid package id." };
    }
    try {
      const result = await this.rpc.run(async (client) => withTimeout(client.movePackageService.getPackage({ packageId: normalized })));
      const response = unwrapResponse(result);
      const pkg = record(response.package) ?? response;
      return {
        kind: "package",
        name,
        packageId: normalized,
        configured: true,
        required,
        exists: true,
        version: text(pkg.version),
        digest: text(pkg.digest),
        modules: moduleNames(pkg),
        explorerUrl: suiExplorerObject(normalized, config.sui.network),
      };
    } catch (error) {
      return {
        kind: "package", name, packageId: normalized, configured: true, required, exists: false,
        version: null, digest: null, modules: [], explorerUrl: suiExplorerObject(normalized, config.sui.network),
        error: error instanceof Error ? error.message : "Sui package verification failed.",
      };
    }
  }

  private async objectStatus(name: string, objectId: string | undefined, required: boolean): Promise<SuiObjectStatus> {
    const config = loadRuntimeConfig();
    const address = objectId?.trim() || null;
    if (!address) {
      return { kind: "object", name, objectId: null, configured: false, required, exists: false, objectType: null, version: null, digest: null, owner: null, explorerUrl: null };
    }
    let normalized: string;
    try { normalized = normalizeAddress(address); }
    catch (error) {
      return { kind: "object", name, objectId: address, configured: true, required, exists: false, objectType: null, version: null, digest: null, owner: null, explorerUrl: null, error: error instanceof Error ? error.message : "Invalid object id." };
    }
    try {
      const result = await this.rpc.run(async (client) => withTimeout(client.getObject({ objectId: normalized, include: { content: true } })));
      const object = record(record(result)?.object);
      return {
        kind: "object", name, objectId: normalized, configured: true, required, exists: Boolean(object),
        objectType: text(object?.type), version: text(object?.version), digest: text(object?.digest), owner: normalizeOwner(object?.owner),
        explorerUrl: suiExplorerObject(normalized, config.sui.network),
      };
    } catch (error) {
      return {
        kind: "object", name, objectId: normalized, configured: true, required, exists: false, objectType: null, version: null, digest: null, owner: null,
        explorerUrl: suiExplorerObject(normalized, config.sui.network), error: error instanceof Error ? error.message : "Sui object verification failed.",
      };
    }
  }

  async packages(): Promise<SuiPackagesResponse> {
    const config = loadRuntimeConfig();
    const [launchpad, registry] = await Promise.all([
      this.packageStatus("PowerChain Launchpad", config.sui.launchpadPackageId, config.mode === "LIVE"),
      this.objectStatus("PowerChain Graduation Registry", config.sui.graduationRegistryObjectId, config.mode === "LIVE"),
    ]);
    const packages = [launchpad];
    const objects = [registry];
    return {
      chain: "sui",
      network: config.sui.network,
      packages,
      objects,
      allConfigured: [...packages, ...objects].filter((item) => item.required).every((item) => item.configured),
      allRequiredDeploymentsVerified: [...packages, ...objects].filter((item) => item.required).every((item) => item.configured && item.exists),
      observedAt: new Date().toISOString(),
    };
  }

  async asset(coinTypeInput: string): Promise<SuiAssetResponse> {
    const config = loadRuntimeConfig();
    const parsed = parseCoinType(coinTypeInput);
    let coinInfo: Record<string, unknown> = {};
    let metadata: SuiCoinMetadataSummary | null = null;
    try {
      const [infoResult, metadataResult] = await this.rpc.run(async (client: SuiGrpcClient) => Promise.all([
        withTimeout(client.stateService.getCoinInfo({ coinType: parsed.coinType })),
        withTimeout(client.getCoinMetadata({ coinType: parsed.coinType })),
      ]));
      coinInfo = unwrapResponse(infoResult);
      metadata = metadataSummary(coinInfo.metadata) ?? metadataSummary(record(metadataResult)?.coinMetadata);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("RPC_ERROR", error instanceof Error ? error.message : "Sui coin inspection failed.", 503, { retryable: true });
    }

    const treasury = record(coinInfo.treasury);
    const totalSupply = text(treasury?.totalSupply);
    const decimals = metadata?.decimals ?? null;
    const regulated = regulatedSummary(coinInfo.regulatedMetadata);
    const supplyState = text(treasury?.supplyState);
    const regulatedState = regulated?.state?.toUpperCase() ?? null;
    const exists = Boolean(metadata || treasury || text(coinInfo.coinType));
    return {
      chain: "sui",
      network: config.sui.network,
      coinType: parsed.coinType,
      packageId: parsed.packageId,
      module: parsed.module,
      typeName: parsed.typeName,
      exists,
      metadata,
      decimals,
      supplyAtomic: totalSupply,
      supplyUi: totalSupply !== null && decimals !== null ? atomicToUi(BigInt(totalSupply), decimals) : null,
      supplyState,
      treasuryCapObjectId: text(treasury?.id),
      regulatedMetadata: regulated,
      capabilities: {
        metadataRegistered: Boolean(metadata),
        supplyKnown: totalSupply !== null,
        supplyFixed: supplyState?.toUpperCase() === "FIXED",
        burnOnly: supplyState?.toUpperCase() === "BURN_ONLY",
        regulated: regulatedState === "REGULATED",
        globallyPausable: regulated?.allowGlobalPause === true,
      },
      packageExplorerUrl: suiExplorerObject(parsed.packageId, config.sui.network),
      observedAt: new Date().toISOString(),
    };
  }

  async market(coinType: string): Promise<SuiMarketResponse> {
    const asset = await this.asset(coinType);
    let external = null;
    let marketDataError: string | undefined;
    if (this.marketProvider) {
      try { external = await this.marketProvider.getMarket(asset.coinType); }
      catch (error) { marketDataError = error instanceof Error ? error.message : "Sui market provider failed."; }
    }
    const marketDataAvailable = Boolean(external && [external.priceUsd, external.marketCapUsd, external.fdvUsd, external.liquidityUsd, external.volume24hUsd, external.priceChange24hPercent, external.holderCount].some((value) => value !== null));
    return {
      chain: "sui",
      network: asset.network,
      coinType: asset.coinType,
      supplyAtomic: asset.supplyAtomic,
      supplyUi: asset.supplyUi,
      decimals: asset.decimals,
      symbol: asset.metadata?.symbol ?? null,
      name: asset.metadata?.name ?? null,
      priceUsd: external?.priceUsd ?? null,
      marketCapUsd: external?.marketCapUsd ?? null,
      fdvUsd: external?.fdvUsd ?? null,
      liquidityUsd: external?.liquidityUsd ?? null,
      volume24hUsd: external?.volume24hUsd ?? null,
      priceChange24hPercent: external?.priceChange24hPercent ?? null,
      holderCount: external?.holderCount ?? null,
      source: external?.source ?? "sui-grpc",
      sources: external ? ["sui-grpc", external.source] : ["sui-grpc"],
      observedAt: external?.observedAt ?? asset.observedAt,
      marketDataAvailable,
      ...(marketDataError ? { marketDataError } : {}),
      packageExplorerUrl: asset.packageExplorerUrl,
    };
  }
}
