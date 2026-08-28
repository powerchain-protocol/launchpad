# Contributing to PowerChain Launchpad

Contributions must preserve the financial, wallet and authority invariants of the platform. A UI improvement is not acceptable if it weakens server-authoritative validation or creates an alternate settlement path.

## Development setup

```bash
cp .env.example .env.local
npm install
npm run typecheck
npm run build
npm run dev
```

Use development/devnet identities only in local configuration. Never commit private keys, seed phrases, wallet exports, production secrets or populated local data stores.

## Contribution rules

1. Keep **1.0.0** as the canonical release version unless a product release is explicitly approved.
2. Keep financial amounts in exact integer/base-unit form at authoritative boundaries; avoid floating-point settlement arithmetic.
3. Do not trust client-supplied balances, prices, fees, settlement status, sale stage or pool readiness.
4. Do not mark a transaction successful from a wallet signature alone. Preserve RPC reconciliation and exact intent binding.
5. Preserve quote idempotency and one-time intent consumption.
6. Preserve one-time administrator nonce challenges and revision checks.
7. Do not bypass Token-2022 extension validation for PWRC.
8. Do not implement fake or placeholder DEX execution. Unsupported adapters must fail closed.
9. Keep private/server configuration outside `NEXT_PUBLIC_*` variables.
10. Keep API/admin/transactional responses out of offline PWA caches.

## Code organization

- `app/` — Next.js routes, pages and API handlers.
- `components/` — reusable UI components.
- `lib/client/` — browser-side helpers.
- `lib/server/` — authoritative server policy, persistence and validation.
- `lib/solana/` — Solana transaction/token/pool boundaries.
- `types/` — shared domain contracts.
- `programs/` — Anchor reference programs.
- `public/` — static assets and PWA resources.

Prefer extending existing domain boundaries over introducing duplicate helpers or alternate state machines.

## Financial and blockchain changes

Changes to payments, claims, sale accounting, pool creation, fee logic or wallet authorization should include tests or deterministic validation for:

- zero and boundary amounts;
- mint decimals/base units;
- stale quote/revision behavior;
- duplicate/replayed requests;
- expired nonce/challenge behavior;
- incorrect wallet/recipient/mint/program identities;
- RPC failure and unknown confirmation state;
- Token-2022 transfer-fee configuration mismatch; and
- missing/unimplemented DEX adapter behavior.

Never fabricate mainnet program IDs, mint addresses, treasury addresses, transaction signatures or successful reconciliation evidence.

## UI and accessibility

- Keep primary actions explicit and reviewable before signing.
- Show fees, recipients and transaction purpose before wallet approval.
- Prevent horizontal overflow on supported mobile widths.
- Preserve keyboard focus visibility and semantic labels.
- Pair status color with text/icon meaning.
- Respect reduced-motion preferences.
- Do not expose secrets or raw sensitive configuration in UI errors.

## Pull request checklist

Before requesting review:

```bash
npm run typecheck
npm run build
```

Also verify:

- no dead buttons, placeholder links or unreachable routes were introduced;
- no generated `.data`, `.next`, `target`, logs or local environment files are included;
- API errors remain structured and fail closed;
- new financial mutations are idempotent where retry is possible;
- documentation and `.env.example` are updated when configuration changes; and
- `CHANGELOG.md` is updated for release-significant behavior.

## Commit scope

Keep changes focused. Refactors should not silently alter fee policy, authority, settlement semantics, sale lifecycle or pool readiness behavior. If an invariant must change, document it explicitly in the pull request and update the relevant tests and documentation.
