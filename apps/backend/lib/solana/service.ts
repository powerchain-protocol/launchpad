import {
  Connection,
  PublicKey,
  type AccountInfo,
  type ParsedAccountData,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { loadRuntimeConfig } from "@powerchain/launchpad-config";
import {
  AppError,
  RPC_HEALTH_TIMEOUT_MS,
  solanaExplorerAddress,
} from "@powerchain/launchpad-shared";
import { SolanaRpcFallback } from "@powerchain/solana";
import { isResolvedMarketData } from "./market-resolver";
import type {
  SolanaAssetResponse,
  SolanaCreatorResponse,
  SolanaCreatorTokenAccount,
  SolanaMarketDataProvider,
  SolanaMarketResponse,
  SolanaOverview,
  SolanaProgramCategory,
  SolanaProgramKind,
  SolanaProgramStatus,
  SolanaProgramsResponse,
  SolanaRpcHealthResponse,
  SolanaRpcProviderHealth,
  SolanaTokenExtensionSummary,
  SolanaTokenMetadataSummary,
} from "./types";

const AUTHORITY_NOTICE =
  "This endpoint reports read-network state only. Changing an RPC or read network cannot change configured treasury, program, escrow, or settlement authority.";
const PLACEHOLDER_PROGRAM_ID = "11111111111111111111111111111111";

function publicKey(value: string, field = "address"): PublicKey {
  try { return new PublicKey(value); }
  catch { throw new AppError("BAD_REQUEST", `${field} must be a valid Solana address.`, 400); }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = RPC_HEALTH_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new AppError("RPC_ERROR", `Solana RPC exceeded ${timeoutMs}ms.`, 503, { retryable: true })), timeoutMs);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

async function getClusterHealth(endpoint: string): Promise<"ok" | "unknown" | "error"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return "error";
    const payload = await response.json() as { result?: unknown; error?: unknown };
    if (payload.error) return "unknown";
    return payload.result === "ok" ? "ok" : "unknown";
  } catch { return "unknown"; }
  finally { clearTimeout(timer); }
}

function parsedInfo(account: Awaited<ReturnType<Connection["getParsedAccountInfo"]>>["value"]): Record<string, unknown> | null {
  if (!account || !("parsed" in account.data)) return null;
  const data = account.data as ParsedAccountData;
  const parsed = data.parsed;
  if (!parsed || typeof parsed !== "object") return null;
  const info = (parsed as Record<string, unknown>).info;
  return info && typeof info === "object" ? info as Record<string, unknown> : null;
}

function nullableAuthority(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function tokenStandard(owner: PublicKey): SolanaAssetResponse["tokenProgram"] {
  if (owner.equals(TOKEN_2022_PROGRAM_ID)) return "token-2022";
  if (owner.equals(TOKEN_PROGRAM_ID)) return "spl-token";
  return "unknown";
}

function extensionSummary(value: unknown): SolanaTokenExtensionSummary | null {
  if (typeof value === "string" && value.trim()) return { type: value.trim(), details: {} };
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const type = [record.extension, record.extensionType, record.type, record.name].find((item) => typeof item === "string" && item.trim()) as string | undefined;
  const state = record.state && typeof record.state === "object" && !Array.isArray(record.state)
    ? record.state as Record<string, unknown>
    : Object.fromEntries(Object.entries(record).filter(([key]) => !["extension", "extensionType", "type", "name"].includes(key)));
  return { type: type?.trim() || "unknown", details: state };
}

function normalizedType(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findExtension(extensions: SolanaTokenExtensionSummary[], names: string[]): SolanaTokenExtensionSummary | undefined {
  const set = new Set(names.map(normalizedType));
  return extensions.find((item) => set.has(normalizedType(item.type)));
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function metadataFromExtensions(extensions: SolanaTokenExtensionSummary[]): SolanaTokenMetadataSummary | null {
  const extension = findExtension(extensions, ["tokenMetadata", "metadata"]);
  if (!extension) return null;
  const details = extension.details;
  const additional = Array.isArray(details.additionalMetadata)
    ? details.additionalMetadata.flatMap((entry): Array<[string, string]> => {
        if (Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === "string" && typeof entry[1] === "string") return [[entry[0], entry[1]]];
        return [];
      })
    : [];
  return {
    name: text(details.name),
    symbol: text(details.symbol),
    uri: text(details.uri),
    updateAuthority: text(details.updateAuthority),
    additionalMetadata: additional,
  };
}

function atomicToUi(amount: bigint, decimals: number): string {
  if (decimals <= 0) return amount.toString();
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const divisor = 10n ** BigInt(decimals);
  const whole = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function programStatus(
  descriptor: {
    kind: SolanaProgramKind;
    category: SolanaProgramCategory;
    name: string;
    address?: string;
    required: boolean;
    executableRequired: boolean;
  },
  account: AccountInfo<Buffer> | null | undefined,
  network: SolanaOverview["network"],
  error?: string,
): SolanaProgramStatus {
  const address = descriptor.address?.trim() || null;
  const placeholder = Boolean(address && address === PLACEHOLDER_PROGRAM_ID && descriptor.kind !== "token-2022");
  return {
    kind: descriptor.kind,
    category: descriptor.category,
    name: descriptor.name,
    address,
    configured: Boolean(address),
    required: descriptor.required,
    exists: Boolean(account),
    executable: account?.executable ?? false,
    executableRequired: descriptor.executableRequired,
    placeholder,
    owner: account?.owner.toBase58() ?? null,
    lamports: account ? String(account.lamports) : null,
    explorerUrl: address ? solanaExplorerAddress(address, network) : null,
    ...(error ? { error } : {}),
  };
}

function verifiedProgram(program: SolanaProgramStatus): boolean {
  if (!program.configured || program.placeholder || !program.exists) return false;
  return !program.executableRequired || program.executable;
}

export class SolanaReadService {
  private readonly rpc: SolanaRpcFallback;

  constructor(rpcUrls: string[], private readonly marketProvider?: SolanaMarketDataProvider) {
    this.rpc = new SolanaRpcFallback(rpcUrls, "confirmed");
  }

  async rpcHealth(): Promise<SolanaRpcHealthResponse> {
    const config = loadRuntimeConfig();
    const providers = await Promise.all(this.rpc.connections.map(async (connection, index): Promise<SolanaRpcProviderHealth> => {
      const started = performance.now();
      try {
        const [slot, blockHeight, version, latest, genesisHash, clusterHealth] = await withTimeout(Promise.all([
          connection.getSlot("confirmed"),
          connection.getBlockHeight("confirmed"),
          connection.getVersion(),
          connection.getLatestBlockhash("confirmed"),
          connection.getGenesisHash(),
          getClusterHealth(connection.rpcEndpoint),
        ]));
        const genesisMatch = config.solana.expectedGenesisHash ? genesisHash === config.solana.expectedGenesisHash : null;
        const ok = genesisMatch !== false;
        return {
          provider: `rpc-${index + 1}`,
          ok,
          clusterHealth,
          latencyMs: Math.round(performance.now() - started),
          slot,
          blockHeight,
          coreVersion: version["solana-core"] ?? null,
          latestBlockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
          genesisHash,
          genesisHashMatchesExpected: genesisMatch,
          ...(ok ? {} : { error: "RPC genesis hash does not match SOLANA_EXPECTED_GENESIS_HASH." }),
        };
      } catch (error) {
        return {
          provider: `rpc-${index + 1}`,
          ok: false,
          clusterHealth: "error",
          latencyMs: Math.round(performance.now() - started),
          slot: null,
          blockHeight: null,
          coreVersion: null,
          latestBlockhash: null,
          lastValidBlockHeight: null,
          genesisHash: null,
          genesisHashMatchesExpected: null,
          error: error instanceof Error ? error.message : "RPC health check failed.",
        };
      }
    }));
    const healthy = providers.filter((provider) => provider.ok);
    const primary = healthy[0] ?? providers[0];
    return {
      chain: "solana",
      network: config.solana.network,
      status: healthy.length === providers.length && healthy.length > 0 ? "ok" : healthy.length > 0 ? "degraded" : "error",
      healthyProviders: healthy.length,
      providerCount: providers.length,
      providers,
      slot: primary?.slot ?? null,
      blockHeight: primary?.blockHeight ?? null,
      coreVersion: primary?.coreVersion ?? null,
      latestBlockhash: primary?.latestBlockhash ?? null,
      lastValidBlockHeight: primary?.lastValidBlockHeight ?? null,
      genesisHash: primary?.genesisHash ?? null,
      observedAt: new Date().toISOString(),
      authorityNotice: AUTHORITY_NOTICE,
    };
  }

  async overview(): Promise<SolanaOverview> {
    const config = loadRuntimeConfig();
    const started = performance.now();
    const health = await this.rpcHealth();
    if (health.status === "error" || health.slot === null || health.blockHeight === null || !health.coreVersion || !health.latestBlockhash || health.lastValidBlockHeight === null) {
      throw new AppError("RPC_ERROR", "No healthy Solana RPC provider is available for overview.", 503, { retryable: true });
    }
    try {
      const [epochInfo, transactionCount] = await this.rpc.run((connection) => withTimeout(Promise.all([
        connection.getEpochInfo("confirmed"),
        connection.getTransactionCount("confirmed").catch(() => null),
      ])));
      return {
        chain: "solana",
        network: config.solana.network,
        status: health.status,
        latencyMs: Math.round(performance.now() - started),
        slot: health.slot,
        blockHeight: health.blockHeight,
        epoch: epochInfo.epoch,
        epochSlotIndex: epochInfo.slotIndex,
        slotsInEpoch: epochInfo.slotsInEpoch,
        absoluteSlot: epochInfo.absoluteSlot,
        transactionCount,
        coreVersion: health.coreVersion,
        latestBlockhash: health.latestBlockhash,
        lastValidBlockHeight: health.lastValidBlockHeight,
        genesisHash: health.genesisHash,
        rpcProviderCount: health.providerCount,
        healthyRpcProviders: health.healthyProviders,
        configured: {
          launchpadProgram: Boolean(config.solana.launchpadProgramId),
          vestingProgram: Boolean(config.solana.vestingProgramId),
          graduationRegistry: Boolean(config.solana.graduationRegistry),
          powerPayCheckoutProgram: Boolean(config.powerPay.checkoutProgramId),
          powerPaySettlementsProgram: Boolean(config.powerPay.settlementsProgramId),
          powerPayFactoryProgram: Boolean(config.powerPay.factoryProgramId),
          pwrcMint: Boolean(config.solana.pwrcMint),
          usdcMint: Boolean(config.solana.usdcMint),
          treasury: Boolean(config.solana.treasury),
          serviceFeeRecipient: Boolean(config.solana.serviceFeeRecipient),
        },
        observedAt: new Date().toISOString(),
        authorityNotice: AUTHORITY_NOTICE,
      };
    } catch (error) {
      throw new AppError("RPC_ERROR", error instanceof Error ? error.message : "Unable to read Solana overview.", 503, { retryable: true });
    }
  }

  async programs(): Promise<SolanaProgramsResponse> {
    const config = loadRuntimeConfig();
    const liveRequired = config.mode === "LIVE";
    const descriptors: Array<{
      kind: SolanaProgramKind;
      category: SolanaProgramCategory;
      name: string;
      address?: string;
      required: boolean;
      executableRequired: boolean;
    }> = [
      { kind: "launchpad", category: "launchpad", name: "PowerChain Launchpad", address: config.solana.launchpadProgramId, required: liveRequired, executableRequired: true },
      { kind: "vesting", category: "launchpad", name: "PowerChain Token-2022 Vesting", address: config.solana.vestingProgramId, required: liveRequired, executableRequired: true },
      { kind: "graduation-registry", category: "launchpad", name: "PowerChain Graduation Registry", address: config.solana.graduationRegistry, required: liveRequired, executableRequired: false },
      { kind: "powerpay-checkout", category: "powerpay", name: "PowerPay Checkout", address: config.powerPay.checkoutProgramId, required: config.powerPay.programsRequired, executableRequired: true },
      { kind: "powerpay-settlements", category: "powerpay", name: "PowerPay Settlements", address: config.powerPay.settlementsProgramId, required: config.powerPay.programsRequired, executableRequired: true },
      { kind: "powerpay-factory", category: "powerpay", name: "PowerPay Factory", address: config.powerPay.factoryProgramId, required: config.powerPay.programsRequired, executableRequired: true },
      { kind: "token-2022", category: "solana", name: "SPL Token-2022", address: TOKEN_2022_PROGRAM_ID.toBase58(), required: true, executableRequired: true },
    ];

    const programs = await Promise.all(descriptors.map(async (descriptor) => {
      if (!descriptor.address) return programStatus(descriptor, null, config.solana.network);
      try {
        const key = publicKey(descriptor.address, `${descriptor.name} address`);
        const account = await this.rpc.run((connection) => withTimeout(connection.getAccountInfo(key, "confirmed")));
        return programStatus(descriptor, account, config.solana.network);
      } catch (error) {
        return programStatus(descriptor, null, config.solana.network, error instanceof Error ? error.message : "Program lookup failed.");
      }
    }));

    const required = programs.filter((program) => program.required);
    const powerPayPrograms = programs.filter((program) => program.category === "powerpay");
    const configuredPowerPay = powerPayPrograms.filter((program) => program.configured);
    return {
      chain: "solana",
      network: config.solana.network,
      programs,
      allConfigured: required.every((program) => program.configured),
      allRequiredDeploymentsVerified: required.every(verifiedProgram),
      powerPayConfigured: powerPayPrograms.every((program) => program.configured),
      powerPayVerified: configuredPowerPay.length > 0 && configuredPowerPay.every(verifiedProgram) && (!config.powerPay.programsRequired || powerPayPrograms.length === configuredPowerPay.length),
      observedAt: new Date().toISOString(),
    };
  }

  async asset(mintAddress: string): Promise<SolanaAssetResponse> {
    const config = loadRuntimeConfig();
    const mint = publicKey(mintAddress, "mint");
    try {
      return await this.rpc.run(async (connection) => {
        const account = await withTimeout(connection.getParsedAccountInfo(mint, "confirmed"));
        const value = account.value;
        const info = parsedInfo(value);
        const ownerProgram = value?.owner?.toBase58() ?? null;
        const standard = value?.owner ? tokenStandard(value.owner) : "unknown";
        const [supply, largest] = standard === "unknown"
          ? [null, { value: [] } as Awaited<ReturnType<Connection["getTokenLargestAccounts"]>>]
          : await withTimeout(Promise.all([
              connection.getTokenSupply(mint, "confirmed").catch(() => null),
              connection.getTokenLargestAccounts(mint, "confirmed").catch(() => ({ context: { slot: 0 }, value: [] })),
            ]));
        const rawExtensions = Array.isArray(info?.extensions) ? info.extensions : [];
        const extensions = rawExtensions.map(extensionSummary).filter((item): item is SolanaTokenExtensionSummary => Boolean(item));
        const extensionTypes = [...new Set(extensions.map((item) => item.type))];
        const normalized = new Set(extensionTypes.map(normalizedType));
        const metadata = metadataFromExtensions(extensions);
        const mintAuthority = nullableAuthority(info?.mintAuthority);
        const freezeAuthority = nullableAuthority(info?.freezeAuthority);
        const capabilities = {
          mintAuthorityActive: Boolean(mintAuthority),
          freezeAuthorityActive: Boolean(freezeAuthority),
          transferFee: normalized.has("transferfeeconfig") || normalized.has("transferfee"),
          transferHook: normalized.has("transferhook") || normalized.has("transferhookprogramid"),
          permanentDelegate: normalized.has("permanentdelegate"),
          nonTransferable: normalized.has("nontransferable"),
          confidentialTransfer: [...normalized].some((name) => name.includes("confidentialtransfer")),
          interestBearing: normalized.has("interestbearingconfig") || normalized.has("interestbearingmint"),
          defaultAccountState: normalized.has("defaultaccountstate"),
          metadataPointer: normalized.has("metadatapointer"),
        };
        const reasons: string[] = [];
        let compatibility: SolanaAssetResponse["powerPay"]["status"] = standard === "unknown" ? "unknown" : "standard";
        if (capabilities.nonTransferable || capabilities.confidentialTransfer) {
          compatibility = "unsupported";
          if (capabilities.nonTransferable) reasons.push("Non-transferable mint cannot be used as a normal payment rail.");
          if (capabilities.confidentialTransfer) reasons.push("Confidential-transfer extensions require a dedicated settlement verifier.");
        } else if (capabilities.transferFee || capabilities.transferHook || capabilities.permanentDelegate || capabilities.defaultAccountState) {
          compatibility = "extension-aware";
          reasons.push("Token-2022 extensions require extension-aware transfer and settlement verification.");
        }
        if (mintAuthority) reasons.push("Mint authority is still active.");
        if (freezeAuthority) reasons.push("Freeze authority is still active.");

        return {
          chain: "solana",
          network: config.solana.network,
          mint: mint.toBase58(),
          exists: Boolean(value),
          tokenProgram: standard,
          ownerProgram,
          decimals: supply?.value.decimals ?? (typeof info?.decimals === "number" ? info.decimals : null),
          supplyAtomic: supply?.value.amount ?? (typeof info?.supply === "string" ? info.supply : null),
          supplyUi: supply?.value.uiAmountString ?? null,
          mintAuthority,
          freezeAuthority,
          isInitialized: typeof info?.isInitialized === "boolean" ? info.isInitialized : null,
          extensions,
          extensionTypes,
          metadata,
          capabilities,
          powerPay: {
            status: compatibility,
            configuredAsPwrc: config.solana.pwrcMint === mint.toBase58(),
            configuredAsUsdc: config.solana.usdcMint === mint.toBase58(),
            reasons,
          },
          largestAccounts: largest.value.map((entry) => ({
            address: entry.address.toBase58(),
            amountAtomic: entry.amount,
            amountUi: entry.uiAmountString,
            decimals: entry.decimals,
          })),
          explorerUrl: solanaExplorerAddress(mint.toBase58(), config.solana.network),
          observedAt: new Date().toISOString(),
        };
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("RPC_ERROR", error instanceof Error ? error.message : "Unable to read Solana mint.", 503, { retryable: true });
    }
  }

  async creator(walletAddress: string): Promise<SolanaCreatorResponse> {
    const config = loadRuntimeConfig();
    const wallet = publicKey(walletAddress, "creator wallet");
    try {
      return await this.rpc.run(async (connection) => {
        const [account, balance, classic, token2022] = await withTimeout(Promise.all([
          connection.getAccountInfo(wallet, "confirmed"),
          connection.getBalance(wallet, "confirmed"),
          connection.getParsedTokenAccountsByOwner(wallet, { programId: TOKEN_PROGRAM_ID }, "confirmed"),
          connection.getParsedTokenAccountsByOwner(wallet, { programId: TOKEN_2022_PROGRAM_ID }, "confirmed"),
        ]));
        const mapAccounts = (entries: typeof classic.value, program: "spl-token" | "token-2022"): SolanaCreatorTokenAccount[] => entries.flatMap((entry) => {
          if (!("parsed" in entry.account.data)) return [];
          const info = (entry.account.data as ParsedAccountData).parsed?.info as Record<string, unknown> | undefined;
          const tokenAmount = info?.tokenAmount as Record<string, unknown> | undefined;
          const mint = typeof info?.mint === "string" ? info.mint : null;
          const amount = typeof tokenAmount?.amount === "string" ? tokenAmount.amount : null;
          const decimals = typeof tokenAmount?.decimals === "number" ? tokenAmount.decimals : null;
          if (!mint || !amount || decimals === null) return [];
          return [{
            account: entry.pubkey.toBase58(),
            mint,
            tokenProgram: program,
            amountAtomic: amount,
            amountUi: typeof tokenAmount?.uiAmountString === "string" ? tokenAmount.uiAmountString : null,
            decimals,
          }];
        });
        const tokenAccounts = [...mapAccounts(classic.value, "spl-token"), ...mapAccounts(token2022.value, "token-2022")]
          .sort((a, b) => {
            try { return BigInt(b.amountAtomic) > BigInt(a.amountAtomic) ? 1 : BigInt(b.amountAtomic) < BigInt(a.amountAtomic) ? -1 : 0; }
            catch { return 0; }
          });
        const aggregate = (mint?: string) => {
          if (!mint) return { atomic: null as string | null, ui: null as string | null };
          const matching = tokenAccounts.filter((entry) => entry.mint === mint);
          if (!matching.length) return { atomic: "0", ui: "0" };
          const total = matching.reduce((sum, entry) => sum + BigInt(entry.amountAtomic), 0n);
          return { atomic: total.toString(), ui: atomicToUi(total, matching[0]?.decimals ?? 0) };
        };
        const pwrc = aggregate(config.solana.pwrcMint);
        const usdc = aggregate(config.solana.usdcMint);
        return {
          chain: "solana",
          network: config.solana.network,
          wallet: wallet.toBase58(),
          accountExists: Boolean(account),
          lamports: String(balance),
          sol: atomicToUi(BigInt(balance), 9),
          ownerProgram: account?.owner.toBase58() ?? null,
          executable: account?.executable ?? false,
          tokenAccountCount: tokenAccounts.length,
          tokenAccounts: tokenAccounts.slice(0, 100),
          powerPay: {
            pwrcMint: config.solana.pwrcMint ?? null,
            pwrcBalanceAtomic: pwrc.atomic,
            pwrcBalanceUi: pwrc.ui,
            usdcMint: config.solana.usdcMint ?? null,
            usdcBalanceAtomic: usdc.atomic,
            usdcBalanceUi: usdc.ui,
            isTreasury: config.solana.treasury === wallet.toBase58(),
            isServiceFeeRecipient: config.solana.serviceFeeRecipient === wallet.toBase58(),
          },
          explorerUrl: solanaExplorerAddress(wallet.toBase58(), config.solana.network),
          observedAt: new Date().toISOString(),
        };
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("RPC_ERROR", error instanceof Error ? error.message : "Unable to read creator wallet.", 503, { retryable: true });
    }
  }

  async market(mintAddress: string): Promise<SolanaMarketResponse> {
    const config = loadRuntimeConfig();
    const asset = await this.asset(mintAddress);
    let external: Awaited<ReturnType<SolanaMarketDataProvider["getMarket"]>> = null;
    let marketDataError: string | undefined;
    if (this.marketProvider) {
      try { external = await this.marketProvider.getMarket(asset.mint); }
      catch (error) { marketDataError = error instanceof Error ? error.message : "Market data provider failed."; }
    }
    const calculatedMarketCap = external?.marketCapUsd ?? (
      external?.priceUsd !== null && external?.priceUsd !== undefined && asset.supplyUi !== null
        ? Number(asset.supplyUi) * external.priceUsd
        : null
    );
    const marketCapUsd = typeof calculatedMarketCap === "number" && Number.isFinite(calculatedMarketCap) ? calculatedMarketCap : null;
    const pricePublishTime = external?.pricePublishTime ?? null;
    const priceAgeSeconds = pricePublishTime && Number.isFinite(Date.parse(pricePublishTime))
      ? Math.max(0, Math.floor((Date.now() - Date.parse(pricePublishTime)) / 1_000))
      : null;
    const priceConfidencePercent = external?.priceUsd && external.priceConfidenceUsd !== null && external.priceConfidenceUsd !== undefined
      ? (external.priceConfidenceUsd / external.priceUsd) * 100
      : null;
    const resolved = external && isResolvedMarketData(external) ? external : null;
    return {
      chain: "solana",
      network: config.solana.network,
      mint: asset.mint,
      supplyAtomic: asset.supplyAtomic,
      supplyUi: asset.supplyUi,
      decimals: asset.decimals,
      tokenProgram: asset.tokenProgram,
      mintAuthority: asset.mintAuthority,
      freezeAuthority: asset.freezeAuthority,
      extensionTypes: asset.extensionTypes,
      extensions: asset.extensions,
      priceUsd: external?.priceUsd ?? null,
      marketCapUsd,
      fdvUsd: external?.fdvUsd ?? null,
      liquidityUsd: external?.liquidityUsd ?? null,
      volume24hUsd: external?.volume24hUsd ?? null,
      priceChange24hPercent: external?.priceChange24hPercent ?? null,
      holderCount: external?.holderCount ?? null,
      priceConfidenceUsd: external?.priceConfidenceUsd ?? null,
      priceConfidencePercent: typeof priceConfidencePercent === "number" && Number.isFinite(priceConfidencePercent) ? priceConfidencePercent : null,
      pricePublishTime,
      priceAgeSeconds,
      priceStale: priceAgeSeconds === null ? null : priceAgeSeconds > config.solanaMarket.maxPriceAgeSeconds,
      source: external?.source ?? "solana-rpc",
      sources: resolved?.sources ?? (external ? [external.source] : []),
      providerObservations: resolved?.observations ?? [],
      observedAt: external?.observedAt ?? asset.observedAt,
      marketDataAvailable: Boolean(external),
      ...(marketDataError ? { marketDataError } : {}),
      explorerUrl: asset.explorerUrl,
    };
  }
}
