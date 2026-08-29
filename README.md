# PowerChain Launchpad™

**Version:** 1.0.0  
**Status:** Production-oriented canonical baseline  
**Networks:** Solana + Sui  
**Solana token standard:** SPL Token-2022

PowerChain Launchpad is a dual-chain token launch and checkout platform with an explicit two-signature creator launch invariant, server-authoritative payment intents, fail-closed settlement verification, governed graduation adapters, vesting, eligibility, simulation, and production reconciliation.

## Core invariants

A creator launch has exactly two wallet approval stages:

```text
Tx 1  Deploy token primitive
      Solana: Token-2022 mint
      Sui: compiled Move token package

Tx 2  Configure + activate launch
      curve + payout splits + launch policy + anti-bot delay
      + immutable graduation adapter + optional dev-buy/vesting
```

Preview, simulation, eligibility evaluation, configuration signing, webhooks, reconciliation, and recovery do **not** create a third creator signature stage.

## Workspace

```text
apps/
  frontend/     Next.js user and creator application
  backend/      API v1, checkout, launch orchestration, RPC verification
  realtime/     authenticated WebSocket settlement/status transport
packages/
  config/       canonical runtime configuration and readiness policy
  domain/       launch + checkout invariants and normalized types
  program-client/ chain adapter contracts
  server/       Node-only signing/realtime utilities
  shared/       errors, API types, constants, epoch/explorer/RPC utilities
  bigint-buffer/ pure-JS BigInt/byte compatibility package; no native bindings
  solana/       Token-2022, payment, RPC, WebSocket and launch helpers
  sui/          Move launch, gRPC fallback and Sui utilities
programs/
  solana/       Anchor launch policy + vesting programs
  sui/          Move launchpad, registry, vesting and token template
prisma/         PostgreSQL launch-state schema and canonical migration
```

## Product surfaces

- `/` — Launchpad discovery and product status
- `/launch` — Creator Console
- `/checkout` — PowerPay SOL/USDC checkout
- `/claims` — chain-derived vesting schedules, transaction preparation and verified claim confirmation
- `/wallet` — wallet and read-RPC status
- `/docs` — in-app architecture and security reference

Public navigation uses Next.js client transitions. Mobile navigation is a modal dialog with focus trapping, Escape-to-close, trigger focus restoration, background scroll locking and route-aware `aria-current`. Dashboard workspace navigation uses the same client-side routing contract.

## Payment and settlement path

```text
SERVER QUOTE
  → deterministic SHA-256 quote hash
PERSIST QUOTE (D1)
  → wallet/network/asset bound
CREATE ORDER
  → idempotency key
PERSIST TRANSACTION INTENT
  → exact recipients + assets + atomic amounts + fee + quote hash
PREPARE SOLANA TRANSACTION
  → recent blockhash + lastValidBlockHeight
WALLET REVIEW + SIGN
  → Phantom / Solflare / Backpack
SUBMIT
  → transaction signature only
RPC QUORUM + EFFECT VERIFICATION
  → expected transaction intent must match
SETTLED → RECONCILED → RECEIPT
```

A wallet signature is never treated as settlement proof. Wrong recipient, wrong amount, wrong asset, wrong network, expired transaction, mismatched quote commitment, or conflicting RPC evidence fails closed.

## Production HTTP guarantees

All API v1 routes use the same request boundary:

- 1 MiB default request-body ceiling
- oversized declared bodies rejected with HTTP 413
- chunked bodies protected by streaming byte limits
- generated or preserved `x-request-id`
- `Cache-Control: no-store`
- centralized CORS allowlist
- security headers
- D1-backed rate limiting when production bindings are installed
- consistent JSON success/error envelopes
- request duration through `Server-Timing`

## RPC and realtime behavior

Read-RPC UX uses an eight-second timeout with `idle`, `checking`, `ok`, and `error` states, defensive response parsing and latency reporting. Selecting a different read RPC/network in the UI **cannot** alter treasury, escrow, launch adapter, fee-recipient, or settlement authority.

Realtime delivery is advisory. Settlement remains database + RPC authoritative. The WebSocket service enforces:

- 64 KiB frame ceiling
- 120 client messages per minute
- bounded failed-authentication attempts
- maximum 32 subscriptions per connection
- explicit policy errors
- WebSocket close code 1008 for policy violations
- polling fallback in the frontend


## Solana read endpoints

Canonical system-oriented API v1:

```text
GET /api/v1/rpc/health
GET /api/v1/programs/verify
GET /api/v1/token/mint/:mint
GET /api/v1/token/market?mint=<required>
```

Chain-oriented v1 routes remain supported through the same `SolanaReadService`:

```text
GET /api/v1/solana/overview
GET /api/v1/solana/programs
GET /api/v1/solana/market?mint=<required>
GET /api/v1/solana/assets/:mint
```

Short compatibility aliases are wrappers only:

```text
GET /api/solana/overview
GET /api/token/market?mint=<optional>
GET /api/assets/:mint
```

`/api/token/market` defaults to configured `PWRC_MINT` when `mint` is omitted; canonical `/api/v1/token/market` always requires an explicit mint.

RPC health includes cluster `getHealth`, slot, block height, Solana core version, latest blockhash, `lastValidBlockHeight`, provider latency and fallback-provider status without exposing RPC URLs. Program verification checks the Launchpad program, Token-2022 vesting program, graduation registry and SPL Token-2022. Mint inspection distinguishes SPL Token from Token-2022 and returns supply, decimals, authorities, extensions and largest accounts.

Market resolution can combine explicit Pyth feed mappings with CoinGecko and CoinMarketCap enrichment. RPC supply/mint state stays authoritative; unavailable market fields remain `null`.

The website app has matching server-side Next.js proxies, so browser clients use the same `/api/...` URLs while Helius/custom RPC URLs and market-provider credentials stay server-side. Configure `POWERCHAIN_API_INTERNAL_URL` on the web server.

## Runtime modes

`POWERCHAIN_RUNTIME_MODE` supports:

- `READ_ONLY`
- `SIMULATION`
- `LIVE`
- `MAINTENANCE`

Signable checkout transactions are prepared only when `LIVE` readiness passes. Production readiness includes RPC, database, treasury, mint/package, fee recipient, price oracle, CORS, review-signing and realtime/webhook controls.

## Development

Required runtime baseline:

```text
Node >= 22
pnpm 11.24.0
PostgreSQL
D1-compatible checkout database binding
Solana RPC
Sui gRPC
```

Typical commands:

```bash
pnpm install
pnpm prisma:generate
pnpm check
pnpm build
```

Static repository checks that do not require installed workspace dependencies:

```bash
node scripts/check-accessibility.mjs
node scripts/validate-d1-migration.mjs
node scripts/validate-production.mjs
node scripts/check-typescript-syntax.mjs
```

## BigInt buffer compatibility

`packages/bigint-buffer` is the canonical workspace replacement for native `bigint-buffer` usage in Solana/payment dependency paths. It exposes `toBigIntBE`, `toBigIntLE`, `toBufferBE`, and `toBufferLE` through dual ESM/CommonJS entry points, has no dependencies or build scripts, validates inputs and widths, rejects overflow instead of truncating, and returns Node `Buffer` values when available with `Uint8Array` fallback for browser runtimes.

The package remains versioned with the application at **1.0.0** and is marked private to prevent accidental publication. Production lockfile validation should confirm any intended override resolves to the workspace copy.

## Production bootstrap

The API intentionally does not invent production addresses or chain adapters. A deployment host installs `PowerChainRuntimeBindings` during process initialization with:

- the real D1 database binding;
- Solana/Sui launch adapters;
- optional chain analytics readers;
- reconciliation webhook verifiers;
- Sui chain-status and checkout verifier integrations where enabled.

See `runtime-bindings.example.ts` and [Deployment](docs/DEPLOYMENT.md).

## Security

Private keys are never requested or persisted by the application. Creator and payer wallets approve transactions locally. Review signing is a server integrity mechanism, not a substitute for wallet signatures.

See [Security](docs/SECURITY.md), [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), and [Operations](docs/OPERATIONS.md).

## Chain programs

Solana includes an Anchor launch-policy/governance program and a Token-2022 vesting program. Sui includes the launchpad, governed graduation-adapter registry, vesting module, and controlled token template. Source-level serializer/contract validators run without the chain toolchains; deployment must additionally compile programs, generate Anchor IDLs, synchronize real program IDs, and run `scripts/validate-deployment-programs.mjs`.

### Solana market providers

Named server-side resolution supports Pyth Hermes, CoinGecko Onchain and CoinMarketCap DEX market data plus an optional normalized HTTP adapter. Configure provider selection with `POWERCHAIN_SOLANA_MARKET_PROVIDERS`. Pyth requires an explicit mint→feed mapping. Provider credentials are never exposed through public configuration or website responses.

### PowerPay operations surface

The 1.0.0 workspace includes a `/powerpay` operations page and shared server-side APIs for RPC/cluster health, program deployment verification, PWRC/Token-2022 mint inspection, Pyth/CoinGecko/CoinMarketCap market resolution, and public creator-wallet inspection. PowerPay-specific endpoints compose the canonical Solana read service; they are not duplicate implementations. Website-origin Next.js rewrites keep RPC/provider credentials server-side.

## Sui read endpoints

Canonical Sui API v1:

```text
GET /api/v1/sui/overview
GET /api/v1/sui/packages
GET /api/v1/sui/market?coinType=<required>
GET /api/v1/sui/assets/:coinType
```

Compatibility aliases are wrappers only and return `X-PowerChain-Canonical-Endpoint`:

```text
GET /api/sui/overview
GET /api/sui/packages
GET /api/sui/market?coinType=<required>
GET /api/sui/assets/:coinType
```

The Sui read plane uses Mysten's gRPC/Core API through the shared `SuiReadService`. Overview reports provider health, chain identifier, checkpoint height, epoch, reference gas price, protocol version and configured PowerChain Sui deployment state. Package verification checks the configured Launchpad package and graduation-registry object. Coin inspection uses gRPC coin information and metadata to expose decimals, total supply, TreasuryCap identity when available, supply policy and regulated-coin state.

Market data remains RPC/gRPC-authoritative for coin identity and supply. Optional enrichment is server-side through `POWERCHAIN_SUI_MARKET_DATA_URL`; if no provider is configured, market fields remain `null` and `source` is `sui-grpc` rather than guessed. The same paths are proxied through the website origin, so Sui gRPC endpoints and market-provider credentials never need to be browser-visible.
