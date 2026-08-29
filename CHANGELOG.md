# Changelog

## 1.0.0 — Canonical production baseline

- Added `/api/v1/powerpay/overview`, `/rpc`, `/programs`, `/market`, and `/mint/:mint` operational endpoints backed by the canonical Solana read service.
- Added public-chain creator wallet inspection with SOL, SPL/Token-2022, PWRC/USDC balance and public authority-role reporting.
- Upgraded mint inspection with normalized Token-2022 extensions, embedded metadata, authority/capability flags and PowerPay compatibility classification.
- Added optional PowerPay Checkout, Settlements and Factory program verification plus `POWERPAY_PROGRAMS_REQUIRED` LIVE readiness gating.
- Upgraded RPC health with genesis-hash reporting and optional `SOLANA_EXPECTED_GENESIS_HASH` pinning.
- Upgraded Pyth resolution with confidence/publish-time fields and stale-price signalling; enriched CoinMarketCap resolution with holder-count and pool liquidity/volume queries.
- Added responsive `/powerpay` workspace UI and matching website-origin proxy routes.
- Added canonical `/api/v1/rpc/health`, `/api/v1/programs/verify`, `/api/v1/token/mint/:mint`, and explicit-mint `/api/v1/token/market` endpoints.
- Added RPC `getHealth`, latest blockhash/expiry, fallback-provider observations and anonymized provider latency reporting.
- Added Pyth/CoinGecko/CoinMarketCap market resolution with explicit Pyth mint→feed mapping and field-level fallback.
- Added matching Next.js website-origin proxies that keep RPC and market-provider credentials server-side.
- Added canonical Solana overview/program/market/asset read APIs plus compatibility aliases backed by one RPC/market service.
- Added validated optional Solana market-data provider integration with RPC-only fallback and no fabricated market values.
- Consolidated the dual-chain launch platform under one stable application version.
- Preserved the two-creator-signature launch invariant across Solana and Sui.
- Added governed, immutable graduation adapter selection.
- Added launch windows, per-wallet limits, public/allowlist/private phases, progressive vesting and Tx 2 simulation.
- Added signed configuration snapshots and review hashes.
- Added cross-chain launch analytics and webhook/indexer-assisted reconciliation with RPC verification fallback.
- Added server-authoritative SOL/USDC PowerPay checkout with D1 quotes, orders and transaction intents.
- Added serialized Solana wallet transactions with blockhash-expiry guards.
- Added exact transaction-effect verification and multi-RPC quorum reconciliation.
- Added authenticated realtime status delivery with polling fallback.
- Added centralized API request limits, request IDs, no-store caching, CORS and D1-backed rate limits.
- Added responsive Launchpad, Creator Console, Checkout, Claims, Wallet and Docs surfaces.
- Added accessible modal navigation, route-aware navigation and dashboard privacy headers.
- Added canonical PostgreSQL and D1 baseline migrations.
- Added accessibility, D1 migration and production architecture validators.
- Upgraded Solana Token-2022 vesting to a PDA-controlled linear/progressive production vault with actual credited-balance accounting and no admin cancellation path.
- Added concrete Solana and Sui `LaunchChainAdapter` implementations and durable Sui TreasuryCap recovery state.
- Added source-level Anchor serializer/IDL contract validation and fail-closed real-keypair program-ID synchronization workflow.
- Reconciled Sui launch/registry/vesting fields with persisted launch policy commitments.
- Added canonical health/OpenAPI endpoints and removed obsolete Next.js `next lint` scripts from the release workflow.
- Added `.env.example` and final build/validation reporting.

### Sui operational read plane

- Added canonical `/api/v1/sui/overview`, `/packages`, `/market`, and `/assets/:coinType` routes.
- Added thin `/api/sui/*` compatibility aliases with canonical-endpoint response headers.
- Added shared gRPC/Core API service using primary/fallback Sui full nodes.
- Added chain/checkpoint/epoch/gas/protocol overview, package/registry verification, coin metadata/supply/TreasuryCap/regulated-state inspection, and optional normalized market enrichment.
- Added matching website-origin Next.js rewrites and LIVE HTTPS validation for the optional Sui market provider.
