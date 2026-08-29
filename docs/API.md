# PowerChain Launchpad API v1

All API responses use the centralized HTTP boundary. Responses are non-cacheable, carry a generated or preserved `x-request-id`, and return a structured JSON envelope. The default request-body ceiling is 1 MiB for both declared and chunked bodies.

## Service and runtime

- `GET /api/v1/health` — backend process health and application version.
- `GET /api/v1/runtime/readiness` — authoritative runtime mode, chain readiness, blockers, and transfer enablement.
- `GET /api/v1/openapi` — OpenAPI 3.1 document for the supported API v1 surface.

Swagger-compatible clients should use the OpenAPI document. UI defaults are security-oriented: `persistAuthorization: false`, `tryItOutEnabled: false`, and request-duration visibility enabled.

## Checkout / PowerPay

- `POST /api/v1/checkout/quotes` — create a server-authoritative SOL or USDC quote bound to wallet, network, asset, amount, treasury, service fee, nonce, expiry, and SHA-256 quote commitment.
- `POST /api/v1/checkout/orders` — create an idempotent order, persist its transaction intent, and return the serialized unsigned Solana transaction plus expiry metadata and optional short-lived realtime session.
- `GET /api/v1/checkout/orders/:id` — read persisted settlement evidence and receipt state.
- `POST /api/v1/checkout/orders/:id/submit` — bind the wallet-submitted transaction signature to the order. Submission is not settlement proof.
- `POST /api/v1/checkout/orders/:id/reconcile` — parse and verify chain effects against the persisted transaction intent, apply RPC quorum semantics, and advance only to a verified state.

Canonical checkout states include `SETTLED`, `ABSENT`, `UNKNOWN`, and `REJECTED` verification outcomes. Ambiguous execution remains fail-closed.

## Solana / PowerPay read plane

Canonical shared Solana endpoints:

- `GET /api/v1/rpc/health` — provider-by-provider cluster health, slot, block height, Solana core version, latest blockhash, last-valid block height and genesis hash. Provider URLs are anonymized in the response.
- `GET /api/v1/programs/verify` — verify Launchpad, Token-2022 vesting, graduation registry, optional PowerPay Checkout/Settlements/Factory programs, and SPL Token-2022. Placeholder program IDs fail verification.
- `GET /api/v1/token/mint/:mint` — inspect SPL Token or Token-2022 owner, supply, decimals, authorities, parsed extensions, metadata, capabilities and PowerPay compatibility.
- `GET /api/v1/token/market?mint=<required>` — combine RPC-authoritative mint state with configured Pyth/CoinGecko/CoinMarketCap market providers. The canonical token-market route always requires a mint.
- `GET /api/v1/creator/:wallet` — public-chain creator wallet inspection: SOL balance, SPL/Token-2022 token accounts, configured PWRC/USDC balances and whether the address matches public treasury/fee-recipient roles.

PowerPay operational endpoints reuse the same services rather than maintaining a second RPC/market implementation:

- `GET /api/v1/powerpay/overview?mint=<optional>` — aggregate RPC health, PowerPay program status, checkout rail readiness, configured PWRC mint inspection and market state.
- `GET /api/v1/powerpay/rpc` — PowerPay view of the canonical RPC health service.
- `GET /api/v1/powerpay/programs` — PowerPay Checkout, Settlements and Factory deployment verification plus Token-2022 dependency state.
- `GET /api/v1/powerpay/market?mint=<optional>` — market state; defaults to configured `PWRC_MINT`.
- `GET /api/v1/powerpay/mint/:mint` — PowerPay view of the canonical mint inspector.

The existing shorter routes remain compatibility aliases only: `/api/solana/overview`, `/api/token/market`, and `/api/assets/:mint`. `/api/token/market` may default to configured PWRC; `/api/v1/token/market` never does.

All of these read endpoints are available through matching Next.js website-origin rewrites. Helius/custom RPC URLs and Pyth/CoinGecko/CoinMarketCap credentials remain backend-only.

## Claims

- `GET /api/v1/claims?chain=solana&wallet=<address>` — read chain-derived vesting schedules and claimable amounts through the configured claims reader. The endpoint does not fabricate balances or schedules when a reader is unavailable.

Claim transaction preparation remains an on-chain program-client responsibility and must be added to the public API only when the deployed vesting program ID and claim serializer are compiler-verified.

## Launches

- `POST /api/v1/launches` — persist a validated launch draft.
- `GET /api/v1/launches/:id` — read the authoritative launch record.
- `POST /api/v1/launches/:id/token/prepare` — prepare creator transaction 1.
- `POST /api/v1/launches/:id/token/confirm` — verify creator transaction 1 on-chain before advancing lifecycle state.
- `POST /api/v1/launches/:id/configure/simulate` — simulate expected transaction 2 effects before wallet review.
- `POST /api/v1/launches/:id/configure/prepare` — create the signed configuration snapshot/review hash and prepare creator transaction 2.
- `POST /api/v1/launches/:id/configure/confirm` — verify transaction 2 and its review hash before moving the launch to `LIVE`.
- `GET /api/v1/launches/:id/graduation/preview` — return governed venue/version plus estimated initial-liquidity/pool parameters when a preview provider is configured.
- `POST /api/v1/launches/:id/recovery/rebuild` — rebuild an expired pending Tx 1 or Tx 2 without creating a third lifecycle signature stage; Tx 2 recovery is pinned to the persisted review hash and adapter version.
- `GET /api/v1/launches/analytics` — normalized Solana/Sui launch analytics when readers are configured.
- `POST /api/v1/launches/reconcile/webhook/:provider` — authenticated indexer/webhook acceleration. Webhook evidence never replaces chain verification.

## Realtime

The standalone realtime service exposes:

- `GET /health` — realtime process health.
- `POST /internal/publish` — internal bearer-authenticated publish endpoint.
- WebSocket connection to the configured realtime URL; clients authenticate with short-lived HMAC tokens embedded in prepared-order responses.

Realtime is advisory. The database and chain verifier remain authoritative and the frontend falls back to polling/status refresh.

## Error contract

A failed request returns a stable code, message, retryable flag, optional details, and request ID. Typical classes include validation errors, 413 payload limits, 429 rate limits, configuration/readiness failures, RPC ambiguity, and intent mismatch/rejection.

## Sui read plane

Canonical routes:

- `GET /api/v1/sui/overview` — gRPC provider health, chain identifier, latest checkpoint height, current epoch, reference gas price, protocol version, epoch timing and configured PowerChain Sui deployment flags.
- `GET /api/v1/sui/packages` — verify the configured PowerChain Launchpad package and graduation-registry object. The response distinguishes package and shared-object deployments and reports existence, version/digest metadata and explorer references where available.
- `GET /api/v1/sui/market?coinType=<required>` — return gRPC-authoritative coin metadata/supply plus optional normalized server-side market enrichment. `coinType` is always required on the canonical route.
- `GET /api/v1/sui/assets/:coinType` — inspect a fully-qualified Move coin type, including normalized package ID, module/type name, metadata, decimals, total supply, TreasuryCap object ID when exposed by `GetCoinInfo`, supply state and regulated-coin metadata.

Compatibility aliases:

- `GET /api/sui/overview`
- `GET /api/sui/packages`
- `GET /api/sui/market?coinType=<required>`
- `GET /api/sui/assets/:coinType`

Aliases delegate to the same `SuiReadService` and add `X-PowerChain-Canonical-Endpoint`; they do not maintain separate gRPC or market implementations.

For path routes, clients should URL-encode the fully qualified Move type, for example `0x2::sui::SUI`.

Website-origin Next.js rewrites expose the same paths from the frontend host while `SUI_GRPC_URL(S)`, fallback gRPC endpoints and `POWERCHAIN_SUI_MARKET_*` credentials remain server-side.
