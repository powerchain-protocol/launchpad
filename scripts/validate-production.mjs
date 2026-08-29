import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];
const checks = {};
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const requireFile = (p) => { if (!exists(p)) errors.push(`missing ${p}`); };
const requireIncludes = (p, fragments) => {
  requireFile(p); if (!exists(p)) return;
  const text = read(p);
  for (const fragment of fragments) if (!text.includes(fragment)) errors.push(`${p} missing ${fragment}`);
};

for (const p of [
  "apps/frontend/app/page.tsx", "apps/frontend/app/checkout/page.tsx", "apps/frontend/app/launch/page.tsx",
  "apps/frontend/app/claims/page.tsx", "apps/frontend/app/wallet/page.tsx", "apps/frontend/app/powerpay/page.tsx", "apps/frontend/app/docs/page.tsx",
]) requireFile(p);
checks.frontendSurfaces = true;

for (const p of [
  "apps/backend/app/api/v1/health/route.ts",
  "apps/backend/app/api/v1/openapi/route.ts",
  "apps/backend/app/api/v1/checkout/quotes/route.ts",
  "apps/backend/app/api/v1/checkout/orders/route.ts",
  "apps/backend/app/api/v1/checkout/orders/[id]/route.ts",
  "apps/backend/app/api/v1/checkout/orders/[id]/submit/route.ts",
  "apps/backend/app/api/v1/checkout/orders/[id]/reconcile/route.ts",
  "apps/backend/app/api/v1/claims/route.ts",
  "apps/backend/app/api/v1/solana/overview/route.ts",
  "apps/backend/app/api/v1/solana/programs/route.ts",
  "apps/backend/app/api/v1/solana/market/route.ts",
  "apps/backend/app/api/v1/solana/assets/[mint]/route.ts",
  "apps/backend/app/api/v1/rpc/health/route.ts",
  "apps/backend/app/api/v1/programs/verify/route.ts",
  "apps/backend/app/api/v1/token/mint/[mint]/route.ts",
  "apps/backend/app/api/v1/token/market/route.ts",
  "apps/backend/app/api/v1/creator/[wallet]/route.ts",
  "apps/backend/app/api/v1/powerpay/overview/route.ts",
  "apps/backend/app/api/v1/powerpay/rpc/route.ts",
  "apps/backend/app/api/v1/powerpay/programs/route.ts",
  "apps/backend/app/api/v1/powerpay/market/route.ts",
  "apps/backend/app/api/v1/powerpay/mint/[mint]/route.ts",
  "apps/backend/lib/powerpay/service.ts",
  "apps/backend/lib/powerpay/http-handlers.ts",
  "apps/backend/app/api/solana/overview/route.ts",
  "apps/backend/app/api/token/market/route.ts",
  "apps/backend/app/api/assets/[mint]/route.ts",
  "apps/backend/lib/solana/service.ts",
  "apps/backend/lib/solana/container.ts",
  "apps/backend/lib/solana/market-provider.ts",
  "apps/backend/lib/solana/market-resolver.ts",
  "apps/backend/lib/solana/pyth-market-provider.ts",
  "apps/backend/lib/solana/coingecko-market-provider.ts",
  "apps/backend/lib/solana/coinmarketcap-market-provider.ts",
  "apps/backend/lib/solana/http-handlers.ts",
  "apps/backend/app/api/v1/sui/overview/route.ts",
  "apps/backend/app/api/v1/sui/packages/route.ts",
  "apps/backend/app/api/v1/sui/market/route.ts",
  "apps/backend/app/api/v1/sui/assets/[coinType]/route.ts",
  "apps/backend/app/api/sui/overview/route.ts",
  "apps/backend/app/api/sui/packages/route.ts",
  "apps/backend/app/api/sui/market/route.ts",
  "apps/backend/app/api/sui/assets/[coinType]/route.ts",
  "apps/backend/lib/sui/service.ts",
  "apps/backend/lib/sui/container.ts",
  "apps/backend/lib/sui/market-provider.ts",
  "apps/backend/lib/sui/http-handlers.ts",
  "apps/backend/app/api/v1/launches/route.ts",
  "apps/backend/app/api/v1/launches/[id]/route.ts",
  "packages/program-client/src/launch/solana-chain-adapter.ts",
  "packages/program-client/src/launch/sui-chain-adapter.ts",
  "packages/server/src/realtime-token.ts",
  "apps/realtime/package.json",
  ".env.example",
]) requireFile(p);
requireIncludes("packages/program-client/src/launch/solana-chain-adapter.ts", ["prepareTokenDeployment", "verifyTokenDeployment", "prepareLaunchConfiguration", "verifyLaunchConfiguration"]);
requireIncludes("packages/program-client/src/launch/sui-chain-adapter.ts", ["prepareTokenDeployment", "verifyTokenDeployment", "prepareLaunchConfiguration", "verifyLaunchConfiguration", "treasuryCapObjectId"]);
requireIncludes("programs/solana/vesting/src/lib.rs", ["TOKEN_2022_PROGRAM_ID", "MAX_TRANCHES", "pub fn claim", "pub fn initialize_vesting"]);
checks.fullStackIntegration = true;

requireIncludes("apps/frontend/lib/wallet/solana.ts", ["Phantom", "Solflare", "Backpack", "signAndSendSerializedSolanaTransaction", "Transaction.from"]);
requireIncludes("apps/frontend/components/pages/checkout-client.tsx", ["transactionBase64", "signAndSendSerializedSolanaTransaction"]);
checks.injectedSolanaSigning = true;

const routeFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === "route.ts") routeFiles.push(full);
  }
}
walk(path.join(root, "apps/backend/app/api"));
for (const file of routeFiles) {
  const text = fs.readFileSync(file, "utf8");
  if (!/handleApi|\broute\(|@\/lib\/(?:solana|powerpay|sui)\/http-handlers/.test(text)) errors.push(`API route bypasses centralized handler: ${path.relative(root, file)}`);
  if (/NextResponse/.test(text)) errors.push(`API route uses NextResponse directly: ${path.relative(root, file)}`);
}
checks.centralApiHandler = routeFiles.length;

requireIncludes("packages/shared/src/constants/networks.ts", ["1024 * 1024"]);
requireIncludes("apps/backend/lib/http/json.ts", ["readBodyLimited", "reader.read()", "REQUEST_TOO_LARGE"]);
requireIncludes("apps/backend/lib/http/handler.ts", ["assertDeclaredBodySize", "X-Request-Id", "Cache-Control", "D1RateLimitStore".replace("D1RateLimitStore", "getRateLimitStore")]);
requireIncludes("apps/backend/lib/http/request-id.ts", ["x-request-id", "crypto.randomUUID"]);
requireIncludes("apps/backend/lib/http/rate-limit.ts", ["rate_limit_buckets", "RETURNING count, reset_at"]);
checks.apiHardening = true;

requireIncludes("apps/backend/lib/openapi/swagger-options.ts", ["persistAuthorization: false", "tryItOutEnabled: false", "displayRequestDuration: true"]);
checks.swaggerSecurity = true;

requireIncludes("apps/realtime/src/server.ts", ["64 * 1024", "120", "MAX_SUBSCRIPTIONS = 32", "MESSAGE_TOO_LARGE", "RATE_LIMIT_EXCEEDED", "AUTH_ATTEMPTS_EXCEEDED", "SUBSCRIPTION_LIMIT_EXCEEDED", "1008"]);
requireIncludes("apps/backend/lib/realtime/publisher.ts", ["publishSettlementEvidence"]);
checks.websocketHardening = true;

requireIncludes("apps/frontend/components/layout/responsive-navigation.tsx", ["aria-modal=\"true\"", "Escape", "document.body.style.overflow", "aria-current", "<Link"]);
requireIncludes("apps/frontend/components/layout/dashboard-frame.tsx", ["<Link", "aria-current", "Workspace mobile"]);
requireIncludes("apps/frontend/next.config.ts", ["X-Robots-Tag", "noindex", "nofollow", "noarchive"]);
checks.navigationAndPrivacy = true;

requireIncludes("apps/frontend/components/wallet/rpc-health-card.tsx", ["8_000", "aria-busy", "checking", "latency", "settlement authority"]);
checks.rpcUx = true;

requireIncludes("apps/backend/lib/checkout/payment-preparation.ts", ["assertLiveExecutionReady", "LIVE_EXECUTION_DISABLED"]);
requireIncludes("apps/backend/lib/checkout/solana-payment-rail.ts", ["lastValidBlockHeight", "serializeSolanaPaymentPlan"]);
requireIncludes("apps/backend/lib/checkout/solana-settlement-verifier.ts", ["REJECTED", "getParsedTransaction"]);
requireIncludes("apps/backend/lib/bootstrap.ts", ["installPowerChainRuntimeBindings", "configureCheckoutServices", "configureLaunchService", "RpcQuorumSettlementVerifier"]);
checks.productionBootstrap = true;

for (const p of [
  "packages/shared/src/utils/epoch.ts", "packages/shared/src/utils/explorer.ts", "packages/shared/src/utils/rpc.ts",
  "packages/solana/src/rpc/fallback.ts", "packages/solana/src/rpc/websocket.ts", "packages/sui/src/rpc/fallback.ts",
]) requireFile(p);
checks.networkUtilities = true;

requireIncludes("apps/backend/lib/solana/service.ts", ["rpcHealth()", "overview()", "programs()", "asset(mintAddress", "creator(walletAddress", "market(mintAddress", "getLatestBlockhash", "getGenesisHash", "RPC_HEALTH_TIMEOUT_MS", "SolanaRpcFallback", "powerpay-checkout", "powerpay-settlements", "powerpay-factory"]);
requireIncludes("apps/backend/lib/solana/market-resolver.ts", ["SolanaMarketResolver", "observations", "sources"]);
requireIncludes("apps/backend/lib/solana/pyth-market-provider.ts", ["PythMarketDataProvider", "v2/updates/price/latest", "feedIdsByMint"]);
requireIncludes("apps/backend/lib/solana/coingecko-market-provider.ts", ["CoinGeckoMarketDataProvider", "onchain/networks/solana/tokens"]);
requireIncludes("apps/backend/lib/solana/coinmarketcap-market-provider.ts", ["CoinMarketCapMarketDataProvider", "v1/dex/token", "platform", "address"]);
requireIncludes("apps/backend/lib/solana/http-handlers.ts", ["mint query parameter is required", "X-PowerChain-Canonical-Endpoint", "pwrcMint", "/api/v1/token/market", "/api/v1/solana/overview"]);
requireIncludes("apps/frontend/next.config.ts", ["POWERCHAIN_API_INTERNAL_URL", "rewrites()", "/api/v1/rpc/health", "/api/v1/programs/verify", "/api/v1/token/mint/:mint", "/api/v1/token/market", "/api/v1/powerpay/overview", "/api/v1/powerpay/programs", "/api/v1/powerpay/market", "/api/v1/creator/:wallet", "/api/token/market"]);
requireIncludes("apps/frontend/components/pages/powerpay-client.tsx", ["PowerPay · Operations", "/api/v1/powerpay/overview", "/api/v1/creator/", "/api/v1/token/mint/"]);
requireIncludes("packages/config/src/index.ts", ["POWERPAY_CHECKOUT_PROGRAM_ID", "POWERPAY_SETTLEMENT_PROGRAM_ID", "POWERPAY_FACTORY_PROGRAM_ID", "SOLANA_EXPECTED_GENESIS_HASH", "POWERCHAIN_SOLANA_MARKET_MAX_PRICE_AGE_SECONDS"]);
checks.solanaReadApis = true;

requireIncludes("apps/backend/lib/sui/service.ts", ["SuiGrpcFallback", "getChainIdentifier", "getReferenceGasPrice", "getCurrentSystemState", "getServiceInfo", "getEpoch", "getCoinInfo", "getCoinMetadata", "movePackageService.getPackage", "POWERCHAIN_SUI_LAUNCHPAD_PACKAGE_ID".replace("POWERCHAIN_SUI_LAUNCHPAD_PACKAGE_ID", "launchpadPackageId")]);
requireIncludes("apps/backend/lib/sui/http-handlers.ts", ["coinType query parameter is required", "X-PowerChain-Canonical-Endpoint", "/api/v1/sui/overview", "/api/v1/sui/packages", "/api/v1/sui/market"]);
requireIncludes("apps/frontend/next.config.ts", ["/api/v1/sui/overview", "/api/v1/sui/packages", "/api/v1/sui/market", "/api/v1/sui/assets/:coinType", "/api/sui/overview", "/api/sui/assets/:coinType"]);
requireIncludes("packages/config/src/index.ts", ["POWERCHAIN_SUI_MARKET_DATA_URL", "POWERCHAIN_SUI_MARKET_TIMEOUT_MS", "POWERCHAIN_SUI_MARKET_DATA_URL_HTTPS"]);
checks.suiReadApis = true;


for (const p of [
  "programs/solana/launchpad/src/lib.rs", "programs/solana/vesting/src/lib.rs",
  "programs/sui/launchpad/sources/launchpad.move", "programs/sui/launchpad/sources/adapter_registry.move",
  "programs/sui/launchpad/sources/vesting.move",
]) requireFile(p);
checks.onChainPrograms = true;

const pgMigrations = fs.readdirSync(path.join(root, "prisma/migrations"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
const d1Migrations = fs.readdirSync(path.join(root, "apps/backend/db/d1/migrations")).filter((name) => name.endsWith(".sql"));
if (pgMigrations.length !== 1 || pgMigrations[0] !== "20260828_v1_0_0") errors.push(`expected one canonical PostgreSQL baseline migration, got ${pgMigrations.join(",")}`);
if (d1Migrations.length !== 1 || d1Migrations[0] !== "0001_v1_0_0.sql") errors.push(`expected one canonical D1 baseline migration, got ${d1Migrations.join(",")}`);
checks.canonicalMigrations = true;

for (const p of ["README.md", "CHANGELOG.md", "MANIFEST.md", "docs/ARCHITECTURE.md", "docs/DEPLOYMENT.md", "docs/SECURITY.md", "docs/API.md", "docs/OPERATIONS.md"]) requireFile(p);
requireIncludes("package.json", ["check:accessibility", "validate:d1", "scripts/validate-production.mjs"]);
requireFile("scripts/check-accessibility.mjs");
requireFile("scripts/validate-d1-migration.mjs");
checks.regressionProtection = true;

const packages = ["package.json", ...fs.readdirSync(path.join(root, "packages"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `packages/${e.name}/package.json`), ...fs.readdirSync(path.join(root, "apps"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `apps/${e.name}/package.json`)];
for (const file of packages) {
  if (!exists(file)) continue;
  const pkg = JSON.parse(read(file));
  if (pkg.version !== "1.0.0") errors.push(`${file} version is ${pkg.version}, expected 1.0.0`);
}
checks.canonicalVersion = true;

const staleVersionPattern = /(?:v)?1\.(?:2|3|4)\.0/g;
const scanExtensions = new Set([".md", ".ts", ".tsx", ".mjs", ".json", ".sql", ".toml", ".rs", ".move"]);
const stale = [];
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", "dist", "generated"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(full);
    else if (scanExtensions.has(path.extname(entry.name))) {
      const text = fs.readFileSync(full, "utf8");
      if (staleVersionPattern.test(text)) stale.push(path.relative(root, full));
      staleVersionPattern.lastIndex = 0;
    }
  }
}
scan(root);
if (stale.length) errors.push(`stale development version strings remain in: ${[...new Set(stale)].join(", ")}`);
checks.versionSweep = true;

const oldValidator = path.join(root, "scripts/validate-dual-chain-launch.mjs");
if (fs.existsSync(oldValidator)) errors.push("obsolete scripts/validate-dual-chain-launch.mjs remains");

if (errors.length) {
  console.error(JSON.stringify({ ok: false, version: "1.0.0", errors, checks }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, version: "1.0.0", checks }, null, 2));
