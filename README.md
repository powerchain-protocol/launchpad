# PowerChain Launchpad

**Version 1.3.0**

Production-oriented **Next.js 16 + TypeScript + Tailwind CSS** application for Solana Token-2022 launches, token sales, claims, merchant payments and controlled liquidity-pool graduation.

## Included

- PowerChain `Logo` component, local PWRC/SOL/USDC/SUI assets, app icons and PWA shell
- Token sale page with stage, cap, exact base-unit sold accounting, progress and countdown; server mutations enforce lifecycle transitions and prevent reducing the cap below already-sold allocation
- `/launch/pools` pool registry with status + venue filters, search, pair identity, launch countdown, initial-price display and linked-sale graduation progress
- `/launch/pools/[id]` deterministic pool review with exact BigInt-safe price formatting, mint-decimal-aware liquidity math, current-vs-approved hashes, stale-review detection, graduation progress, execution-readiness gates and Solscan evidence links
- `/dashboard/admin/pools` wallet-authorized pool manager with separate signed save and review-approval actions, record/configuration revisions, conflict detection and explicit clearing of venue-default fee tiers
- Optimistic concurrency on sale and pool mutations so a stale operator session cannot silently overwrite a newer signed revision
- `/api/v1/pools/[id]/readiness` plus review/execution envelopes in pool list/detail APIs
- Pool adapter capability registry that distinguishes a configured adapter version from an actually implemented transaction builder
- Raydium CPMM, Meteora DAMM v2 and Orca Whirlpool adapter boundaries that fail closed until an implemented adapter version is configured; adapter-version changes invalidate prior review approval
- PowerPay checkout with immutable server-authoritative quotes and a fixed 2% PowerChain fee policy
- PWRC Token-2022 `TransferFeeConfig` inspection, exact net-to-merchant gross-up and maximum-fee-cap protection
- SOL/USDC merchant + explicit PowerChain fee transfer paths
- Payer-paid Solana network fee disclosure
- Send, receive, claims and transaction explorer routes
- One-time nonce wallet challenges for administrator reads and mutations
- Validated-only administrator transaction evidence plus signed operations counters and recent audit events
- Sale admin editing for schedules, accepted SOL/USDC/PWRC assets, lifecycle stage and allocation tiers
- SHA-256 transaction-intent binding to the exact unsigned message reviewed by the wallet
- Confirmed purchase → claim-allocation materialization with exact base units and duplicate protection
- About, information, terms, privacy, cookies, loading and 404 routes
- JSON-backed single-node repository for local development
- Anchor reference programs under `programs/tokensale` and `programs/factory`

## Launch pool lifecycle

```text
DRAFT
  ↓ configuration + authority validation
SCHEDULED
  ↓ save exact configuration
REVIEW APPROVAL
  ↓ one-time wallet signature binds current hash + adapter version
READY
  ↓ dedicated venue build/reconciliation boundary
CREATING
  ↓ wallet signature + on-chain reconciliation
LIVE
  ↓ venue/indexer verification
GRADUATED
```

The current repository implements the registry, review, validation and authority-management boundary. It **does not fabricate Raydium, Meteora or Orca instructions**. A pool cannot reach `READY` unless the venue adapter version is configured **and** an authority has separately approved the current deterministic snapshot. Live pool identity (`poolAddress`, `lpMint`, `creationSignature`) is reserved for a dedicated on-chain reconciliation path.

### Pool review hash

The server hashes the canonical stored configuration including:

- base and quote mint
- base and quote mint decimals
- sale linkage
- venue
- authority and treasury wallet
- initial base/quote liquidity
- fee tier
- launch time
- graduation threshold
- adapter version

Changing one of those fields changes the current hash. The previous approved hash is retained for audit visibility but becomes stale; `READY` is blocked until a fresh `admin:pool:<id>:review` challenge is signed and persisted. Changing the configured adapter version has the same effect.

## Safety invariants

1. Zero-value financial operations are rejected.
2. The configured PowerChain platform fee must remain **200 bps (2%)**.
3. Solana network fees are separate and paid by the transaction payer.
4. Private keys are never requested or stored.
5. A browser-submitted signature is not completion evidence by itself; RPC confirmation and exact intent-message matching are required.
6. Mainnet-sensitive actions fail closed until real mint, merchant, treasury, authority and program identities are configured.
7. Administrator authorization uses a one-time nonce challenge bound to wallet, purpose and expiry.
8. Administrator transaction views return `VALIDATED` records only.
9. Pool records cannot become `READY` while validation blockers remain or while the approved review snapshot is missing/stale.
10. Base/quote decimals are explicit pool configuration and are checked against a linked sale before review approval.
11. Sale stages use controlled transitions; a hard cap cannot be reduced below authoritative sold base units.
12. A configured venue adapter version does not imply executable code; pool execution remains disabled until the transaction builder is explicitly registered as implemented.
13. Sale and pool administrative mutations require the current record revision; stale signed updates fail with a conflict instead of overwriting newer state.
14. Pool review approval is bound to the current configuration revision and records the approving wallet for audit visibility.
15. Venue-specific pool creation remains disabled until a real server-side adapter is implemented, tested, configured and reconciled.
16. The service worker never caches `/api/*` or `/dashboard/admin*` responses.
17. `.data/` and local environment files are ignored to reduce accidental persistence/secret commits.

## Payment fee semantics

### SOL / USDC

The merchant receives the quoted merchant amount. The payer signs an additional explicit **2% PowerChain platform-fee transfer** to the configured fee treasury and pays the Solana network fee.

### PWRC Token-2022

PWRC uses the mint-level Token-2022 `TransferFeeConfig`. Before a quote/build, the server verifies that the active fee is exactly **200 bps** and, when configured, that the withdraw-withheld authority matches PowerChain policy. The payment is grossed up so the merchant receives the intended net amount. If the mint's `maximumFee` cap would reduce the effective fee below 2%, the payment fails closed.

A personal PWRC send does not add a second PowerChain checkout fee; the mint-level Token-2022 transfer fee still applies according to the mint configuration.

## Immutable/idempotent quotes

`POST /api/v1/quotes` requires an `idempotencyKey`. The server hashes the normalized request, persists the quote and returns the same quote when the same key is replayed with the same request. Reusing the key with changed amount/asset/sale data returns `IDEMPOTENCY_CONFLICT`.

Transaction construction requires the stored `quoteId + quoteHash`. The transaction intent then persists the SHA-256 hash of the exact unsigned Solana message. After signing, `/api/v1/transactions` confirms the chain transaction, requires the on-chain message hash to match the persisted intent, consumes the intent once, and only then records validated settlement state.

## On-chain sale reference program

`programs/tokensale` defines `initialize_sale`, `purchase`, and `claim`. A purchase enforces the live window and hard cap, transfers the configured SOL cost to the merchant, transfers the fixed 200-bps PowerChain fee to the fee treasury and increases a buyer allocation PDA. `claim` transfers the unclaimed Token-2022 allocation from the sale vault after `claim_at`.

The web claim endpoint remains **fail closed** until the deployed claim/sale program IDL and vault configuration are supplied. It does not return a fake success transaction.

## PWA behavior

The service worker caches the public shell and static local assets only. It does not cache API responses or admin pages, preventing stale transactional state from being replayed from the browser cache.

## Run

```bash
cp .env.example .env.local
npm install
npm run typecheck
npm run build
npm run dev
```

Before production/mainnet: use a durable transactional PostgreSQL/Supabase repository, deploy audited Anchor programs, implement and pin the selected DEX adapter SDK/version, verify pool creation and LP custody semantics, add indexer/webhook reconciliation with RPC fallback, and configure all authority/mint/program addresses.

## Validation note for this packaged artifact

The source was syntax-transpiled locally after the upgrade. The execution container used to prepare this archive could not resolve `registry.npmjs.org`, so dependency installation and a dependency-resolved `next build` could not be rerun here. The container also does not include the Rust `cargo` executable, so the Anchor reference programs were not cargo-checked in this pass. Run `npm install && npm run typecheck && npm run build` plus the project's Rust/Anchor checks in a fully provisioned development environment before deployment.


## v1.3.0 operational hardening

- Adds record revisions to sales and pools and configuration revisions to pool review-bound state.
- Rejects stale operator saves/review approvals with HTTP 409 revision conflicts.
- Stores the review approver and approved configuration revision alongside the deterministic hash.
- Adds an explicit execution-readiness model separate from configuration-review readiness.
- Requires Ready status, launch time, linked-sale graduation threshold and an implemented venue builder before execution can become eligible.
- Adds a server-only venue capability registry; configured version strings no longer imply implementation.
- Adds exact BigInt-safe initial-price rendering and removes the previous Number-based pool-price calculation path.
- Adds public pool readiness API responses so external clients consume canonical server lifecycle logic.
- Upgrades the authority console with validated settlement counters, pool readiness counters, accepted-asset editing, tier editing and recent signed audit events.
- Fixes clearing an optional custom pool fee tier back to the venue default.
- Expands health reporting to distinguish configured from implemented pool adapters without exposing secrets.

## v1.2.0 pool hardening

- Separates configuration mutation from review approval.
- Retains the last approved hash instead of silently replacing it on edit.
- Detects stale review snapshots after any transaction-bound parameter or adapter-version change.
- Adds explicit base/quote decimals and validates linked-sale mint decimals.
- Computes display liquidity and initial price using configured decimals instead of symbol heuristics.
- Adds linked-sale graduation progress against `graduationThresholdBps`.
- Adds venue filtering and token/pair search to the public pool registry.
- Enforces administrative pool-state transition rules and requires future launch time for `SCHEDULED`.
- Enforces sale-stage transitions, claim-window timing and hard-cap safety.
- Expands `/api/v1/health` with non-secret configuration readiness signals.
