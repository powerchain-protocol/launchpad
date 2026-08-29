# Deployment

## Release identity

Deploy the application as **PowerChain Launchpad 1.0.0**. Dependency, Anchor, Move, program/package, and infrastructure versions are independent from the application version.

## Toolchain

Required for the full release gate:

- Node.js >= 22.16
- pnpm 11.24.0
- PostgreSQL
- a D1-compatible checkout binding
- Rust/Cargo + Anchor CLI compatible with the checked-in Anchor program toolchain
- Sui CLI for Move builds
- Solana and Sui staging RPC infrastructure

Copy `.env.example` to the deployment secret/config system. Do not commit populated secrets.

## Dependency and application build

```bash
corepack prepare pnpm@11.24.0 --activate
pnpm install
pnpm prisma:generate
pnpm check
pnpm build
```

Once a lockfile has been reviewed and committed, production CI should use:

```bash
pnpm install --frozen-lockfile
```

The repository deliberately uses its own accessibility/architecture/TypeScript static guards instead of the removed `next lint` workflow.

## Databases

For a new PostgreSQL environment:

```bash
pnpm prisma:generate
pnpm prisma:migrate:deploy
```

`prisma:migrate:deploy` runs the production-database guard before Prisma migration deployment. The canonical baseline is `prisma/migrations/20260828_v1_0_0/migration.sql`.

For D1, apply `apps/backend/db/d1/migrations/0001_v1_0_0.sql` through the host's D1 migration mechanism and keep `node scripts/validate-d1-migration.mjs` in CI. Existing environments must create additive migrations against their real migration history; do not reset production migration history to the baseline.

## Solana programs

Do not fabricate program IDs. Provide real deployment keypairs at the Anchor target locations, then run:

```bash
pnpm keys:sync
anchor build
node scripts/validate-anchor-idl.mjs
node scripts/validate-deployment-programs.mjs
```

For verifiable program builds where the environment supports them:

```bash
pnpm programs:build:verifiable
```

Deployment validation requires real synchronized IDs, generated `target/idl/powerchain_launchpad_program.json` and `target/idl/powerchain_vesting_program.json`, plus compiled `.so` artifacts.

## Sui programs

Compile both packages before deployment:

```bash
pnpm sui:build
node scripts/validate-sui-contracts.mjs
```

Publish/deploy through the normal controlled Sui deployment process and set the resulting package/fee-vault configuration in server-side runtime config. Tx 1 token publication uses validated compiled template bytecode; arbitrary creator-supplied Move source is not accepted.

## Runtime bindings

The backend host must install `PowerChainRuntimeBindings` before serving LIVE execution paths. See `apps/backend/runtime-bindings.example.ts`.

Bindings include the actual D1 database, Prisma/Postgres repositories, concrete Solana/Sui launch adapters, settlement verifiers, pricing provider, claim readers, analytics readers, webhook verifiers, and chain-status readers appropriate to the deployment.

LIVE readiness fails closed if required RPCs, pricing, persistence, treasury/mint/package/program IDs, fee recipients, signing configuration, CORS, or realtime security configuration is absent.

## Realtime

Deploy `apps/realtime` separately or as its own service process. Configure a >=32-character realtime token secret, internal publish secret, explicit allowed origins, public WebSocket URL, and internal publish URL. Realtime failure must not block authoritative settlement reconciliation; clients retain polling/status refresh fallback.

## Staging release gates

Before enabling LIVE transfers:

1. Run `pnpm check` and `pnpm build` successfully from a frozen dependency graph.
2. Compile Anchor programs and validate compiler-generated IDLs against the TypeScript serializers.
3. Compile Sui Move packages.
4. Execute Solana devnet and Sui testnet Tx 1 + Tx 2 creator flows.
5. Verify the immutable governed graduation venue/adapter commitment.
6. Test optional dev-buy and atomic vesting.
7. Test SOL and USDC checkout with Phantom, Solflare, and Backpack.
8. Test expired Solana blockhash recovery.
9. Test RPC disagreement and `EXECUTION_UNKNOWN` recovery.
10. Test wrong-recipient/amount/asset submissions become `REJECTED`.
11. Test realtime disconnect and polling fallback.
12. Test CORS, 1 MiB body ceiling, request IDs, D1 rate limits, and WebSocket policy limits.
13. Confirm dashboard routes are `noindex, nofollow, noarchive`.

Only then switch `POWERCHAIN_RUNTIME_MODE=LIVE`.

## PowerPay / Solana read configuration

For production, configure primary and fallback Solana RPC endpoints only on the server. Optionally set `SOLANA_EXPECTED_GENESIS_HASH` to pin the expected cluster identity. Configure PowerPay program IDs with `POWERPAY_CHECKOUT_PROGRAM_ID`, `POWERPAY_SETTLEMENT_PROGRAM_ID`, and `POWERPAY_FACTORY_PROGRAM_ID`. Set `POWERPAY_PROGRAMS_REQUIRED=true` only when those deployed programs are required for LIVE readiness.

Market resolution is server-side. Pyth feed IDs are explicitly mapped per mint; a mint address is never guessed to be a Pyth feed. `POWERCHAIN_SOLANA_MARKET_MAX_PRICE_AGE_SECONDS` controls the stale-price signal. CoinGecko and CoinMarketCap credentials, when used, stay out of `NEXT_PUBLIC_*` variables.

## Sui read-plane configuration

Required for Sui reads:

```text
SUI_NETWORK=mainnet|testnet|devnet|localnet
SUI_GRPC_URL=<primary gRPC endpoint>
SUI_GRPC_FALLBACK_URLS=<comma-separated fallback endpoints>
POWERCHAIN_SUI_LAUNCHPAD_PACKAGE_ID=<deployed package id>
POWERCHAIN_SUI_GRADUATION_REGISTRY=<registry object id>
POWERCHAIN_SUI_FEE_VAULT=<fee-vault address>
```

Optional normalized market enrichment:

```text
POWERCHAIN_SUI_MARKET_DATA_URL=https://...
POWERCHAIN_SUI_MARKET_BEARER_TOKEN=
POWERCHAIN_SUI_MARKET_TIMEOUT_MS=8000
```

`POWERCHAIN_SUI_MARKET_DATA_URL` must be HTTPS in LIVE mode. The website only needs `POWERCHAIN_API_INTERNAL_URL`; do not copy Sui gRPC or market credentials into `NEXT_PUBLIC_*` variables.
