# PowerChain Launchpad

**Canonical release: 1.0.0**

PowerChain Launchpad is a production-oriented **Next.js 16, TypeScript and Tailwind CSS** application for Solana token launches, Token-2022 sales, claims, merchant payments and controlled liquidity-pool graduation.

The application is designed around server-authoritative financial state, wallet-approved transactions and fail-closed execution. It never requests or stores private keys.

## Product surfaces

| Surface | Purpose |
| --- | --- |
| `/launch` | Launch discovery and token-sale entry point |
| `/launch/pools` | Liquidity-pool registry, lifecycle, graduation progress and venue status |
| `/sales/[id]` | Sale details, stages, allocation, countdown and purchase flow |
| `/claim` | Validated allocation and claim workflow |
| `/payments` | PowerPay merchant checkout |
| `/send` / `/receive` | Wallet token/payment transfer flows |
| `/explorer` | Validated transaction evidence and Solscan links |
| `/dashboard/admin` | Authority-only operational controls and validated transaction visibility |
| `/dashboard/admin/pools` | Pool configuration, deterministic review and execution-readiness controls |
| `/about`, `/information`, `/legal/*` | Product, information and legal surfaces |

## Core capabilities

- Solana wallet connection with user-approved signing.
- Token-2022-aware PWRC payment handling.
- Fixed **200 bps (2%) PowerChain platform fee** policy.
- Solana network fees remain separate and are paid by the transaction fee payer.
- Server-authoritative quotes with deterministic SHA-256 hashes and idempotency protection.
- Exact unsigned-transaction intent binding before wallet signature acceptance.
- RPC confirmation and exact message matching before settlement is considered validated.
- Exact base-unit sale accounting; zero-value financial operations are rejected.
- Controlled token-sale lifecycle, schedules, caps, payment assets and allocation tiers.
- Validated purchase-to-claim allocation reconciliation with duplicate protection.
- One-time nonce challenges for administrator reads and mutations.
- Optimistic concurrency for sale and pool administration.
- Local PWRC, SOL, USDC and SUI assets, reusable `Logo` component and PWA shell.
- Loading, not-found, information, privacy, terms and cookie routes.
- Anchor reference programs under `programs/tokensale` and `programs/factory`.

## Launch pools

`/launch/pools` models pool configuration and graduation independently from the sale UI.

Supported venue boundaries:

- Raydium CPMM
- Meteora DAMM v2
- Orca Whirlpool

Canonical lifecycle:

```text
DRAFT
  ↓ configuration
SCHEDULED
  ↓ deterministic review
REVIEW APPROVED
  ↓ launch/graduation gates satisfied
READY
  ↓ venue transaction builder + wallet approval
CREATING
  ↓ on-chain reconciliation
LIVE
  ↓ verified graduation
GRADUATED
```

### Pool trust model

A pool is not executable merely because its configuration is valid. The server separately evaluates:

1. configuration validity;
2. authority validation;
3. current deterministic review approval;
4. launch time and linked-sale graduation conditions;
5. lifecycle eligibility;
6. on-chain identity/reconciliation state; and
7. availability of an explicitly implemented venue transaction builder.

Configuring an adapter version does **not** imply that an executable builder exists. Venue execution fails closed until a real adapter is implemented, registered, tested and configured.

Pool review hashes bind transaction-relevant fields including mints, decimals, venue, authority, treasury, liquidity, fee tier, launch time, sale linkage, graduation threshold and adapter version. Any bound-field change invalidates the prior approval and requires a new signed review.

## Fee semantics

### SOL and USDC checkout

The merchant receives the quoted merchant amount. The payer also signs the explicit **2% PowerChain platform-fee transfer** to the configured fee treasury and pays the Solana network fee.

### PWRC Token-2022 checkout

PWRC payments use the mint-level Token-2022 `TransferFeeConfig`. The server verifies the active transfer-fee policy before building a payment and grosses up the transfer so the merchant receives the intended net amount.

If the configured mint policy cannot satisfy the required 200 bps effective fee, settlement fails closed.

A normal user-to-user PWRC send does not add a second checkout platform fee; the mint-level Token-2022 transfer fee still applies according to the mint configuration.

## Security invariants

- Private keys are never requested, accepted or stored.
- Browser state is never authoritative for balances, prices, sale settlement or pool readiness.
- Financial operations require positive non-zero amounts.
- Quotes are immutable and idempotent.
- Wallet signatures are bound to exact server-generated transaction messages.
- A submitted signature alone is not settlement evidence.
- Administrator authorization uses a one-time nonce bound to wallet, purpose and expiry.
- Administrator transaction views expose validated records only.
- Sale and pool mutations require the current record revision; stale writes fail with a conflict.
- Pool review approval is bound to the current configuration revision.
- Mainnet-sensitive actions fail closed until required identities and program configuration are present.
- Dynamic API, admin, sale, payment and pool state is not served from the PWA offline cache.

## Architecture

```text
Browser / Wallet
      │
      ▼
Next.js App Router
      │
      ├── Public launch / sale / pool UI
      ├── Wallet transaction review + signing
      ├── Admin authority UI
      └── API v1
              │
              ├── Quote + intent validation
              ├── Sale / pool lifecycle policy
              ├── Signature + RPC reconciliation
              ├── Token-2022 validation
              └── Repository boundary
                       │
                       └── JSON development store
                           (replace for production)
```

The bundled JSON repository is intended for local single-node development only. Production deployments must use a durable transactional repository such as PostgreSQL/Supabase with appropriate constraints, locking, auditability and backup policy.

## Configuration

Copy the environment template:

```bash
cp .env.example .env.local
```

At minimum, production settlement requires validated values for the relevant:

- Solana cluster and RPC endpoint;
- PWRC / USDC mint identities;
- PowerChain fee treasury;
- merchant and sale authority wallets;
- administrator allowlist;
- deployed program IDs; and
- enabled pool adapter versions/builders.

Secrets and private material must never be exposed through `NEXT_PUBLIC_*` variables.

## Development

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

Production runtime:

```bash
npm run build
npm run start
```

## Production release gate

Do not treat configuration presence as production readiness. Before mainnet deployment:

- run a frozen/reproducible dependency install in CI;
- pass TypeScript and Next.js production builds;
- run dependency and secret scanning;
- deploy a transactional production database and apply schema constraints/migrations;
- deploy and audit the Anchor programs;
- pin and test Solana RPC/indexer providers and reconciliation fallbacks;
- implement and integration-test the selected DEX pool adapters;
- verify PWRC Token-2022 mint extension configuration and authorities;
- verify treasury, merchant, admin and program identities against the intended network;
- test wallet signing, retries, idempotency, stale revisions and unknown transaction outcomes;
- test legal/PWA/accessibility behavior across supported browsers and mobile sizes; and
- monitor health/readiness endpoints without exposing secrets.

## Repository documentation

- [`CHANGELOG.md`](./CHANGELOG.md) — canonical release history.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — contribution and validation requirements.
- [`.env.example`](./.env.example) — non-secret configuration contract.

## Release status

The repository version is intentionally normalized to **1.0.0** across package metadata and runtime health output. Iterative internal hardening is consolidated into this canonical release rather than represented as separate 1.1/1.2/1.3 product versions.
