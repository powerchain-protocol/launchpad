# Changelog

All notable changes to PowerChain Launchpad are documented in this file.

This repository uses **1.0.0 as the canonical product release**. Earlier internal hardening iterations have been consolidated into 1.0.0 rather than published as separate product versions.

## [1.0.0] - 2026-08-28

### Added

- Next.js 16, TypeScript and Tailwind CSS application shell.
- PowerChain brand/logo components and local PWRC, SOL, USDC and SUI assets.
- Token-sale discovery, sale details, stages, countdowns and allocation tiers.
- Server-authoritative quote creation with SHA-256 quote hashes and idempotency keys.
- SOL, USDC and PWRC merchant payment flows.
- Token-2022 `TransferFeeConfig` inspection and PWRC net-to-merchant fee handling.
- Payer-paid Solana network-fee disclosure.
- Wallet send, receive, claim and transaction-explorer surfaces.
- Validated settlement evidence with Solscan links.
- One-time wallet nonce authorization for administrator operations.
- Sale authority console with stage, schedule, accepted-asset and tier management.
- `/launch/pools` public liquidity-pool registry and pool detail surfaces.
- Pool venue boundaries for Raydium CPMM, Meteora DAMM v2 and Orca Whirlpool.
- Deterministic pool review hashes, signed review approval and stale-review detection.
- Pool configuration and execution-readiness models.
- Sale-linked graduation progress and mint-decimal-aware liquidity/price formatting.
- Pool administration with optimistic concurrency and revision tracking.
- Server-side pool adapter capability registry separating configuration from implementation.
- Health/readiness reporting for settlement and pool adapter configuration.
- PWA shell, app icons, loading/not-found routes, About, Information, Terms, Privacy and Cookies pages.
- Anchor reference programs for token sales and factory initialization.

### Security

- Reject zero-value financial operations.
- Keep the PowerChain platform fee fixed at 200 bps in the application policy.
- Bind signed transactions to the exact server-generated unsigned message.
- Require RPC confirmation and message-intent matching before validated settlement.
- Materialize purchase claim allocation exactly once after validated reconciliation.
- Fail closed when required mint, treasury, authority, program or pool adapter configuration is missing.
- Use one-time nonce challenges bound to wallet, purpose and expiry for administrator authorization.
- Restrict administrator transaction views to validated records.
- Reject stale administrative writes using record revisions.
- Invalidate pool review approval whenever transaction-bound pool configuration changes.
- Keep API/admin/transactional surfaces out of service-worker offline caching.
- Ignore local data, environment files, build output and program targets in version control.

### Production requirements

The bundled JSON repository is a development implementation and is not suitable for horizontally scaled production deployment. Mainnet release requires a durable transactional database, audited/deployed programs, configured authorities, reproducible dependency installation, production build validation, and real tested DEX transaction builders for any enabled pool venue.
