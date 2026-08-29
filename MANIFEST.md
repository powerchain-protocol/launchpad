# PowerChain Launchpad 1.0.0 Manifest

## Applications

| Application | Purpose |
| --- | --- |
| `apps/frontend` | Public launchpad, creator workflow, checkout, claims, wallet/RPC and docs |
| `apps/backend` | API v1, Solana read APIs, launch orchestration, payment intents, reconciliation and runtime bootstrap |
| `apps/realtime` | Authenticated settlement/status WebSocket transport |

## Shared packages

| Package | Responsibility |
| --- | --- |
| `@powerchain/launchpad-config` | Runtime configuration, network selection and LIVE readiness |
| `@powerchain/launchpad-domain` | Authoritative launch/checkout state and validation rules |
| `@powerchain/launchpad-program-client` | Solana/Sui launch adapter boundary |
| `@powerchain/launchpad-server` | Node-only signing and realtime session utilities |
| `@powerchain/launchpad-shared` | API contracts, errors, constants and common utilities |
| `bigint-buffer` | Pure-JavaScript BigInt/byte conversions; ESM/CJS; no native bindings or install scripts |
| `@powerchain/solana` | Solana RPC/WebSocket, Token-2022 and payment transaction construction |
| `@powerchain/sui` | Sui gRPC fallback, transaction composition and chain utilities |

## On-chain programs

- Solana launch-policy / governance registry program
- Solana Token-2022 vesting program
- Sui Launchpad Move package
- Sui graduation-adapter registry
- Sui vesting module
- Sui generated token template

## Persistence

- PostgreSQL/Prisma: authoritative launch configuration, phases, adapters, signed review snapshots, analytics and audit/reconciliation records.
- D1: checkout quotes, orders, transaction intents, RPC observations, receipts, rate-limit buckets and realtime-session audit records.

## Canonical migrations

New deployments begin from exactly one baseline migration per persistence domain:

- `prisma/migrations/20260828_v1_0_0/migration.sql`
- `apps/backend/db/d1/migrations/0001_v1_0_0.sql`

Existing deployments must generate an additive migration against their real migration history instead of re-applying these baselines.

## Release validation

- `scripts/validate-production.mjs` — canonical full-stack/source guard.
- `scripts/check-architecture.mjs` — duplicate/architecture guard.
- `scripts/check-accessibility.mjs` — frontend regression guard.
- `scripts/check-typescript-syntax.mjs` — TypeScript parser scan across the monorepo.
- `scripts/validate-anchor-idl.mjs` — Rust/serializer/discriminator alignment and compiler-IDL comparison when IDLs exist.
- `scripts/validate-sui-contracts.mjs` — Move launch/vesting invariant checks.
- `scripts/validate-d1-migration.mjs` — executable D1/SQLite baseline validation.
- `scripts/validate-deployment-programs.mjs` — deployment-only real-ID/IDL/binary gate.
- `BUILD_REPORT.md` — exact executed vs blocked build gates for this source package.

## Solana read service

Canonical system endpoints: `/api/v1/rpc/health`, `/api/v1/programs/verify`, `/api/v1/token/mint/:mint`, `/api/v1/token/market?mint=<required>`. Existing `/api/v1/solana/*` routes use the same `SolanaReadService`. Short `/api/solana`, `/api/token`, and `/api/assets` routes are compatibility wrappers only. The frontend exposes matching server-side Next.js proxies so provider credentials remain backend-only.

## PowerPay operations

The shared Solana read plane also powers `/api/v1/powerpay/*` and the responsive `/powerpay` workspace. It verifies configured PowerPay Checkout/Settlements/Factory programs, reports cluster/genesis/blockhash health, inspects creator wallets and Token-2022 mint capabilities, and resolves PWRC/token market data through explicit Pyth plus CoinGecko/CoinMarketCap providers. All provider credentials remain server-side.

## Sui read-plane additions

- `apps/backend/lib/sui/service.ts`
- `apps/backend/lib/sui/types.ts`
- `apps/backend/lib/sui/container.ts`
- `apps/backend/lib/sui/http-handlers.ts`
- `apps/backend/lib/sui/market-provider.ts`
- canonical `/api/v1/sui/*` routes
- compatibility `/api/sui/*` routes
- website-origin rewrites for all eight Sui paths

Current source-release file count after Sui read-plane integration: **265 files**.
