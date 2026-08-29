# PowerChain Launchpad 1.0.0

Canonical production release source for the dual-chain Solana + Sui Launchpad. The application version remains 1.0.0; dependency, Anchor, Move, and deployment artifact versions are independent.

The release preserves the two creator-approval invariant and includes Token-2022 token creation and vesting, Sui Move token publication and vesting, governed graduation routing, Creator Console simulation/review, server-authoritative PowerPay checkout, D1/PostgreSQL persistence, RPC reconciliation, realtime acceleration, and fail-closed production readiness.


The release also exposes server-side Solana RPC health, program verification, SPL/Token-2022 mint inspection, and Pyth/CoinGecko/CoinMarketCap market resolution. Matching website-origin Next.js rewrites keep RPC and provider credentials on the server.

## PowerPay read-plane upgrade

The canonical 1.0.0 release now includes server-side PowerPay RPC/program/market operations, creator-wallet inspection, richer SPL/Token-2022 mint capability inspection, optional PowerPay Checkout/Settlements/Factory deployment verification, genesis-hash-aware RPC health, Pyth confidence/staleness reporting, CoinGecko/CoinMarketCap enrichment, and a responsive `/powerpay` workspace. These APIs reuse the same Solana read service and website-origin proxy boundary; provider secrets are never sent to the browser.

## Sui read-plane expansion

The canonical 1.0.0 source now exposes gRPC/Core API-backed Sui overview, package verification, coin inspection and market endpoints. Short `/api/sui/*` paths are compatibility aliases only. Matching website-origin rewrites keep Sui gRPC and market-provider credentials on the server.
