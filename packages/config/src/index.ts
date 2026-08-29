import { z } from "zod";

const modeSchema = z.enum(["READ_ONLY", "SIMULATION", "LIVE", "MAINTENANCE"]);
const solanaNetworkSchema = z.enum(["mainnet-beta", "devnet", "testnet", "localnet"]);
const suiNetworkSchema = z.enum(["mainnet", "testnet", "devnet", "localnet"]);

const csv = (value: string | undefined): string[] =>
  (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);

const optional = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

function booleanEnv(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean environment value: ${value}`);
}

function jsonStringRecord(value: string | undefined): Record<string, string> {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[0].trim()) && Boolean(entry[1].trim()))
      .map(([key, item]) => [key.trim(), item.trim()] as const);
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}


export interface RuntimeConfig {
  mode: z.infer<typeof modeSchema>;
  environment: "development" | "test" | "production";
  solana: {
    network: z.infer<typeof solanaNetworkSchema>;
    rpcUrls: string[];
    wsUrl?: string;
    pwrcMint?: string;
    usdcMint?: string;
    treasury?: string;
    serviceFeeRecipient?: string;
    launchpadProgramId?: string;
    vestingProgramId?: string;
    graduationRegistry?: string;
    expectedGenesisHash?: string;
  };
  powerPay: {
    checkoutProgramId?: string;
    settlementsProgramId?: string;
    factoryProgramId?: string;
    programsRequired: boolean;
  };
  sui: {
    network: z.infer<typeof suiNetworkSchema>;
    grpcUrls: string[];
    launchpadPackageId?: string;
    feeVault?: string;
    graduationRegistryObjectId?: string;
  };
  suiMarket: {
    url?: string;
    bearerToken?: string;
    timeoutMs: number;
  };
  pricing: {
    url?: string;
    bearerToken?: string;
    timeoutMs: number;
  };
  checkout: { serviceFeeBps: number; quoteTtlSeconds: number };
  solanaMarket: {
    url?: string;
    bearerToken?: string;
    timeoutMs: number;
    maxPriceAgeSeconds: number;
    providers: string[];
    pyth: {
      baseUrl: string;
      apiKey?: string;
      feedIdsByMint: Record<string, string>;
    };
    coinGecko: {
      baseUrl: string;
      apiKey?: string;
      apiKeyHeader: "x-cg-demo-api-key" | "x-cg-pro-api-key";
    };
    coinMarketCap: {
      baseUrl: string;
      apiKey?: string;
    };
  };
  cors: { allowedOrigins: string[] };
  realtime: {
    publicUrl?: string;
    internalPublishSecret?: string;
    tokenSecret?: string;
  };
  review: {
    keyId?: string;
    privateKeyPem?: string;
  };
}

let cached: RuntimeConfig | undefined;

export function loadRuntimeConfig(env: Record<string, string | undefined> = process.env): RuntimeConfig {
  if (cached && env === process.env) return cached;
  const environment = z.enum(["development", "test", "production"]).parse(env.NODE_ENV ?? "development");
  const mode = modeSchema.parse(env.POWERCHAIN_RUNTIME_MODE ?? (environment === "production" ? "READ_ONLY" : "SIMULATION"));
  const solanaNetwork = solanaNetworkSchema.parse(env.SOLANA_CLUSTER ?? "devnet");
  const suiNetwork = suiNetworkSchema.parse(env.SUI_NETWORK ?? "testnet");
  const timeoutMs = z.coerce.number().int().min(1_000).max(30_000).parse(env.PRICING_TIMEOUT_MS ?? "8000");
  const serviceFeeBps = z.coerce.number().int().min(0).max(2_000).parse(env.POWERCHAIN_CHECKOUT_SERVICE_FEE_BPS ?? "250");
  const quoteTtlSeconds = z.coerce.number().int().min(30).max(3_600).parse(env.POWERCHAIN_QUOTE_TTL_SECONDS ?? "300");
  const solanaMarketTimeoutMs = z.coerce.number().int().min(1_000).max(30_000).parse(env.POWERCHAIN_SOLANA_MARKET_TIMEOUT_MS ?? "8000");
  const solanaMarketMaxPriceAgeSeconds = z.coerce.number().int().min(1).max(3_600).parse(env.POWERCHAIN_SOLANA_MARKET_MAX_PRICE_AGE_SECONDS ?? "60");
  const suiMarketTimeoutMs = z.coerce.number().int().min(1_000).max(30_000).parse(env.POWERCHAIN_SUI_MARKET_TIMEOUT_MS ?? "8000");
  const marketProviders = [...new Set(csv(env.POWERCHAIN_SOLANA_MARKET_PROVIDERS ?? "pyth,coingecko,coinmarketcap"))];
  const pythFeedIdsByMint = jsonStringRecord(env.PYTH_PRICE_FEED_MAP_JSON);
  const configuredPwrcMint = optional(env.PWRC_MINT ?? env.POWERCHAIN_PWRC_MINT);
  const configuredPwrcPythFeed = optional(env.PYTH_PWRC_USD_FEED_ID);
  if (configuredPwrcMint && configuredPwrcPythFeed) pythFeedIdsByMint[configuredPwrcMint] = configuredPwrcPythFeed;
  const solanaRpcUrls = [...new Set([
    ...csv(env.SOLANA_RPC_URLS ?? env.SOLANA_RPC_URL),
    ...csv(env.SOLANA_RPC_FALLBACK_URLS),
  ])];
  const suiGrpcUrls = [...new Set([
    ...csv(env.SUI_GRPC_URLS ?? env.SUI_GRPC_URL),
    ...csv(env.SUI_GRPC_FALLBACK_URLS),
  ])];

  const config: RuntimeConfig = {
    mode,
    environment,
    solana: {
      network: solanaNetwork,
      rpcUrls: solanaRpcUrls,
      ...(optional(env.SOLANA_WS_URL) ? { wsUrl: optional(env.SOLANA_WS_URL) } : {}),
      ...(optional(env.PWRC_MINT ?? env.POWERCHAIN_PWRC_MINT) ? { pwrcMint: optional(env.PWRC_MINT ?? env.POWERCHAIN_PWRC_MINT) } : {}),
      ...(optional(env.USDC_MINT ?? env.POWERCHAIN_USDC_MINT) ? { usdcMint: optional(env.USDC_MINT ?? env.POWERCHAIN_USDC_MINT) } : {}),
      ...(optional(env.POWERCHAIN_TREASURY ?? env.POWERCHAIN_TREASURY_ADDRESS) ? { treasury: optional(env.POWERCHAIN_TREASURY ?? env.POWERCHAIN_TREASURY_ADDRESS) } : {}),
      ...(optional(env.POWERCHAIN_SERVICE_FEE_RECIPIENT ?? env.POWERCHAIN_FEE_RECIPIENT) ? { serviceFeeRecipient: optional(env.POWERCHAIN_SERVICE_FEE_RECIPIENT ?? env.POWERCHAIN_FEE_RECIPIENT) } : {}),
      ...(optional(env.POWERCHAIN_SOLANA_LAUNCHPAD_PROGRAM_ID) ? { launchpadProgramId: optional(env.POWERCHAIN_SOLANA_LAUNCHPAD_PROGRAM_ID) } : {}),
      ...(optional(env.POWERCHAIN_SOLANA_VESTING_PROGRAM_ID) ? { vestingProgramId: optional(env.POWERCHAIN_SOLANA_VESTING_PROGRAM_ID) } : {}),
      ...(optional(env.POWERCHAIN_SOLANA_GRADUATION_REGISTRY) ? { graduationRegistry: optional(env.POWERCHAIN_SOLANA_GRADUATION_REGISTRY) } : {}),
      ...(optional(env.SOLANA_EXPECTED_GENESIS_HASH) ? { expectedGenesisHash: optional(env.SOLANA_EXPECTED_GENESIS_HASH) } : {}),
    },
    powerPay: {
      ...(optional(env.POWERPAY_CHECKOUT_PROGRAM_ID) ? { checkoutProgramId: optional(env.POWERPAY_CHECKOUT_PROGRAM_ID) } : {}),
      ...(optional(env.POWERPAY_SETTLEMENT_PROGRAM_ID ?? env.POWERPAY_SETTLEMENTS_PROGRAM_ID) ? { settlementsProgramId: optional(env.POWERPAY_SETTLEMENT_PROGRAM_ID ?? env.POWERPAY_SETTLEMENTS_PROGRAM_ID) } : {}),
      ...(optional(env.POWERPAY_FACTORY_PROGRAM_ID) ? { factoryProgramId: optional(env.POWERPAY_FACTORY_PROGRAM_ID) } : {}),
      programsRequired: booleanEnv(env.POWERPAY_PROGRAMS_REQUIRED, false),
    },
    sui: {
      network: suiNetwork,
      grpcUrls: suiGrpcUrls,
      ...(optional(env.POWERCHAIN_SUI_LAUNCHPAD_PACKAGE_ID) ? { launchpadPackageId: optional(env.POWERCHAIN_SUI_LAUNCHPAD_PACKAGE_ID) } : {}),
      ...(optional(env.POWERCHAIN_SUI_FEE_VAULT) ? { feeVault: optional(env.POWERCHAIN_SUI_FEE_VAULT) } : {}),
      ...(optional(env.POWERCHAIN_SUI_GRADUATION_REGISTRY) ? { graduationRegistryObjectId: optional(env.POWERCHAIN_SUI_GRADUATION_REGISTRY) } : {}),
    },
    suiMarket: {
      ...(optional(env.POWERCHAIN_SUI_MARKET_DATA_URL) ? { url: optional(env.POWERCHAIN_SUI_MARKET_DATA_URL) } : {}),
      ...(optional(env.POWERCHAIN_SUI_MARKET_BEARER_TOKEN) ? { bearerToken: optional(env.POWERCHAIN_SUI_MARKET_BEARER_TOKEN) } : {}),
      timeoutMs: suiMarketTimeoutMs,
    },
    pricing: {
      ...(optional(env.POWERCHAIN_PRICING_URL) ? { url: optional(env.POWERCHAIN_PRICING_URL) } : {}),
      ...(optional(env.POWERCHAIN_PRICING_BEARER_TOKEN) ? { bearerToken: optional(env.POWERCHAIN_PRICING_BEARER_TOKEN) } : {}),
      timeoutMs,
    },
    checkout: { serviceFeeBps, quoteTtlSeconds },
    solanaMarket: {
      ...(optional(env.POWERCHAIN_SOLANA_MARKET_DATA_URL) ? { url: optional(env.POWERCHAIN_SOLANA_MARKET_DATA_URL) } : {}),
      ...(optional(env.POWERCHAIN_SOLANA_MARKET_BEARER_TOKEN) ? { bearerToken: optional(env.POWERCHAIN_SOLANA_MARKET_BEARER_TOKEN) } : {}),
      timeoutMs: solanaMarketTimeoutMs,
      maxPriceAgeSeconds: solanaMarketMaxPriceAgeSeconds,
      providers: marketProviders,
      pyth: {
        baseUrl: optional(env.PYTH_HERMES_URL) ?? "https://pyth.dourolabs.app/hermes/",
        ...(optional(env.PYTH_API_KEY) ? { apiKey: optional(env.PYTH_API_KEY) } : {}),
        feedIdsByMint: pythFeedIdsByMint,
      },
      coinGecko: {
        baseUrl: optional(env.COINGECKO_API_URL) ?? (optional(env.COINGECKO_PRO_API_KEY) ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3"),
        ...(optional(env.COINGECKO_API_KEY) ? { apiKey: optional(env.COINGECKO_API_KEY) } : {}),
        apiKeyHeader: optional(env.COINGECKO_PRO_API_KEY) ? "x-cg-pro-api-key" : "x-cg-demo-api-key",
        ...(optional(env.COINGECKO_PRO_API_KEY) ? { apiKey: optional(env.COINGECKO_PRO_API_KEY) } : {}),
      },
      coinMarketCap: {
        baseUrl: optional(env.COINMARKETCAP_API_URL) ?? "https://pro-api.coinmarketcap.com",
        ...(optional(env.COINMARKETCAP_API_KEY) ? { apiKey: optional(env.COINMARKETCAP_API_KEY) } : {}),
      },
    },
    cors: { allowedOrigins: csv(env.CORS_ALLOWED_ORIGINS) },
    realtime: {
      ...(optional(env.NEXT_PUBLIC_REALTIME_URL) ? { publicUrl: optional(env.NEXT_PUBLIC_REALTIME_URL) } : {}),
      ...(optional(env.REALTIME_INTERNAL_PUBLISH_SECRET) ? { internalPublishSecret: optional(env.REALTIME_INTERNAL_PUBLISH_SECRET) } : {}),
      ...(optional(env.REALTIME_TOKEN_SECRET) ? { tokenSecret: optional(env.REALTIME_TOKEN_SECRET) } : {}),
    },
    review: {
      ...(optional(env.REVIEW_SIGNING_KEY_ID) ? { keyId: optional(env.REVIEW_SIGNING_KEY_ID) } : {}),
      ...(optional(env.REVIEW_SIGNING_PRIVATE_KEY_PEM) ? { privateKeyPem: optional(env.REVIEW_SIGNING_PRIVATE_KEY_PEM) } : {}),
    },
  };
  if (env === process.env) cached = config;
  return config;
}

function validHttps(value?: string): boolean {
  if (!value) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
function validWss(value?: string): boolean {
  if (!value) return false;
  try { return new URL(value).protocol === "wss:"; } catch { return false; }
}

export function deploymentReadiness(config: RuntimeConfig): string[] {
  if (config.mode !== "LIVE") return [];
  const blockers: string[] = [];
  if (!config.solana.rpcUrls.length) blockers.push("SOLANA_RPC_URLS");
  if (!config.solana.pwrcMint) blockers.push("PWRC_MINT");
  if (!config.solana.treasury) blockers.push("POWERCHAIN_TREASURY");
  if (!config.solana.launchpadProgramId) blockers.push("POWERCHAIN_SOLANA_LAUNCHPAD_PROGRAM_ID");
  if (!config.solana.vestingProgramId) blockers.push("POWERCHAIN_SOLANA_VESTING_PROGRAM_ID");
  if (config.powerPay.programsRequired && !config.powerPay.checkoutProgramId) blockers.push("POWERPAY_CHECKOUT_PROGRAM_ID");
  if (config.powerPay.programsRequired && !config.powerPay.settlementsProgramId) blockers.push("POWERPAY_SETTLEMENT_PROGRAM_ID");
  if (config.powerPay.programsRequired && !config.powerPay.factoryProgramId) blockers.push("POWERPAY_FACTORY_PROGRAM_ID");
  if (!config.sui.grpcUrls.length) blockers.push("SUI_GRPC_URLS");
  if (!config.sui.launchpadPackageId) blockers.push("POWERCHAIN_SUI_LAUNCHPAD_PACKAGE_ID");
  if (!config.sui.feeVault) blockers.push("POWERCHAIN_SUI_FEE_VAULT");
  if (!config.sui.graduationRegistryObjectId) blockers.push("POWERCHAIN_SUI_GRADUATION_REGISTRY");
  if (config.suiMarket.url && !validHttps(config.suiMarket.url)) blockers.push("POWERCHAIN_SUI_MARKET_DATA_URL_HTTPS");
  if (!validHttps(config.pricing.url)) blockers.push("POWERCHAIN_PRICING_URL_HTTPS");
  if (config.solanaMarket.url && !validHttps(config.solanaMarket.url)) blockers.push("POWERCHAIN_SOLANA_MARKET_DATA_URL_HTTPS");
  if (config.solanaMarket.providers.includes("pyth") && !validHttps(config.solanaMarket.pyth.baseUrl)) blockers.push("PYTH_HERMES_URL_HTTPS");
  if (config.solanaMarket.providers.includes("pyth") && Object.keys(config.solanaMarket.pyth.feedIdsByMint).length && !config.solanaMarket.pyth.apiKey) blockers.push("PYTH_API_KEY");
  if (config.solanaMarket.providers.includes("coingecko") && !validHttps(config.solanaMarket.coinGecko.baseUrl)) blockers.push("COINGECKO_API_URL_HTTPS");
  if (config.solanaMarket.providers.includes("coinmarketcap") && !validHttps(config.solanaMarket.coinMarketCap.baseUrl)) blockers.push("COINMARKETCAP_API_URL_HTTPS");
  if (!config.cors.allowedOrigins.length || config.cors.allowedOrigins.includes("*")) blockers.push("CORS_ALLOWED_ORIGINS");
  if (config.realtime.publicUrl && !validWss(config.realtime.publicUrl)) blockers.push("NEXT_PUBLIC_REALTIME_URL_WSS");
  if (!config.review.keyId || !config.review.privateKeyPem) blockers.push("REVIEW_SIGNING_KEY");
  return blockers;
}

export function resetRuntimeConfigForTests(): void { cached = undefined; }
