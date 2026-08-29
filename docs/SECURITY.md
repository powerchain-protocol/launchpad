# Security

## Custody and signatures

PowerChain never requests, receives, or persists wallet private keys. Phantom, Solflare, Backpack, and supported Sui wallets sign locally. The creator launch lifecycle has exactly two wallet approval stages: Tx 1 deploys the token primitive and Tx 2 configures/activates the launch. Simulation, reconciliation, recovery, webhooks, and signed server review snapshots never create a hidden third creator-signature stage.

## Launch policy integrity

Tx 2 commits the reviewed launch policy to chain state. Critical commitments include curve inputs, payout splits, launch window, per-wallet initial purchase limit, eligibility commitment, anti-bot delay, governed graduation venue/adapter/version/config hash, optional dev-buy/vesting commitment, and the signed review hash.

The graduation route is immutable after activation. Solana validates the governed registry/adapter account on-chain. Sui validates the governed adapter registry before activation. Neither client nor backend may silently substitute an unapproved venue adapter.

## Token-2022 vesting

The Solana vesting program is Token-2022-only, uses PDA-controlled vault authority, validates linear/progressive schedules, caps progressive schedules at 32 tranches, uses checked arithmetic, and records the amount actually credited to the vault after Token-2022 transfer-fee behavior. Claims are beneficiary-authorized; no creator/admin cancellation backdoor exists.

## Payment intent binding

A checkout transaction must match the persisted intent exactly:

- chain and network;
- payer wallet;
- payment asset;
- treasury and fee recipients;
- atomic payment and fee amounts;
- quote commitment;
- unexpired intent/blockhash context.

A submitted signature is evidence of submission only. The verifier parses chain effects and RPC evidence before settlement. Executed transactions with the wrong recipient, amount, asset, wallet, network, or quote commitment become `REJECTED` rather than settled.

## Ambiguous execution and RPC quorum

Timeout, incomplete evidence, or provider disagreement produces `EXECUTION_UNKNOWN`/`UNKNOWN`. No allocation or receipt is issued from an ambiguous state. Individual RPC observations are persisted and reconciliation applies configured quorum rules. Webhooks/indexers may accelerate discovery but do not override RPC/on-chain verification.

## API boundary

- 1 MiB default request ceiling for declared and chunked request bodies.
- Oversized requests fail with HTTP 413.
- Production CORS is explicit; wildcard origins fail readiness.
- `x-request-id` is validated/preserved or generated for correlation.
- API responses use `Cache-Control: no-store` and security headers.
- D1-backed rate limiting is used when production bindings are installed.
- JSON parsing is defensive and malformed bodies fail with a structured 400.
- Server-authoritative pricing, recipient addresses, fees, intent hashes, and settlement state are never trusted from browser input.

## Realtime boundary

Realtime is non-authoritative. Subscription tokens are short-lived and HMAC protected. Authorized topics are cryptographically bound to the token and clients cannot subscribe outside that set. Internal publishing uses a separate bearer secret.

Connection policy:

- 64 KiB message ceiling;
- 120 messages/minute/connection;
- maximum 32 subscriptions;
- bounded authentication failures;
- explicit `MESSAGE_TOO_LARGE`, `RATE_LIMIT_EXCEEDED`, `AUTH_ATTEMPTS_EXCEEDED`, `SUBSCRIPTION_LIMIT_EXCEEDED`, and `TOPIC_NOT_AUTHORIZED` errors;
- policy close code 1008;
- origin allowlisting;
- per-message compression disabled;
- ping/pong heartbeat cleanup.

## Review snapshot integrity

Tx 2 preparation creates a canonical configuration hash and Ed25519 server signature/key ID. Confirmation verifies that the on-chain transaction contains the same review hash. Review signing proves server-side configuration integrity; it does not replace creator wallet approval.

## Program IDs and key management

The source distribution intentionally does not fabricate Solana program IDs. Placeholder `declare_id!` values may exist only before deployment keypairs are supplied. A release deployment must run `scripts/sync-program-ids.sh`, which requires real Anchor keypairs and runs `anchor keys sync`. `scripts/validate-deployment-programs.mjs` then requires synchronized IDs, compiler-generated IDLs, and `.so` artifacts.

Never expose database credentials, review-signing private keys, webhook HMAC secrets, internal realtime tokens, private RPC credentials, deployment keypairs, or privileged treasury credentials through `NEXT_PUBLIC_*` variables or frontend bundles.

## PowerPay read-plane secrecy and authority

RPC, oracle and market-provider credentials are server-only. The frontend uses website-origin Next.js rewrites and never receives configured Helius/custom RPC URLs, Pyth keys, CoinGecko keys or CoinMarketCap keys. RPC health identifies providers only as `rpc-1`, `rpc-2`, and so on.

`SOLANA_EXPECTED_GENESIS_HASH` can pin a deployment to an expected cluster identity. A provider returning another genesis hash is marked unhealthy and cannot become the healthy read source. Read-RPC selection never changes treasury, fee-recipient, program or settlement authority.

Mint inspection treats active authorities and Token-2022 extensions as explicit capabilities. Non-transferable or confidential-transfer mints are not silently treated as standard PowerPay rails; transfer-fee, transfer-hook, permanent-delegate and default-account-state extensions are classified as extension-aware.

## Sui read-plane credential boundary

Sui gRPC URLs, provider API keys and internal market-provider credentials are server-only configuration. The frontend reaches the read plane through same-origin Next.js rewrites and receives only normalized responses. Provider URLs are not included in the public response model.

Canonical and compatibility Sui routes share one service implementation and the centralized API boundary, preserving request IDs, `Cache-Control: no-store`, CORS controls, request-size limits and D1-backed read-rate limiting.

The market endpoint treats gRPC coin metadata/supply as authoritative. Optional external market data may populate price, liquidity, volume, market-cap and holder fields only; provider failure or missing configuration returns null market fields instead of synthesized values.
