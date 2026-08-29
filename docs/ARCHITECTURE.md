# Architecture

## Trust model

PowerChain separates **preparation**, **approval**, **verification**, and **persistence**.

```text
Browser / wallet
    ↓ user approval only
API preparation layer
    ↓ deterministic intent / review snapshot
Chain transaction
    ↓
RPC verification quorum
    ↓
Authoritative persistence
    ↓
Realtime notification (advisory)
```

The browser never supplies an authoritative price, treasury address, fee recipient, settlement result, graduation adapter, configuration hash, or launch-state transition.

## Launch lifecycle

```text
DRAFT
 → TOKEN_DEPLOY_PENDING
 → TOKEN_DEPLOYED
 → LAUNCH_CONFIG_PENDING
 → LIVE
 → GRADUATION_READY
 → GRADUATING
 → GRADUATED
```

Tx 1 and Tx 2 are the only creator-signature boundaries. A rebuilt expired pending transaction remains the same stage and must preserve the reviewed terms.

## Chain-specific token deployment

### Solana

Tx 1 creates an SPL Token-2022 mint and initializes required extensions before mint initialization. Tx 2 initializes launch-policy state, payout configuration, curve parameters, immutable graduation adapter and optional dev-buy/vesting instructions.

### Sui

Tx 1 publishes compiled Move token bytecode from the validated token template. Tx 2 creates launch state, pays the configured launch fee, stores policy/curve/graduation configuration, optionally composes dev-buy + vesting atomically, and activates the launch.

## Checkout authority

D1 checkout state and PostgreSQL launch state are intentionally separate domains. Checkout idempotency and settlement remain authoritative in D1; token-launch lifecycle state remains authoritative in PostgreSQL/Prisma.

## Recovery

Recovery never mutates signed terms. Rebuilt Tx 2 material is pinned to the persisted review hash and governed graduation adapter/version. A new economic or policy configuration requires a new launch review path, not silent recovery mutation.

## Solana read plane

`apps/backend/lib/solana` is the single read-plane implementation for cluster overview, program deployment status, mint/asset inspection and market enrichment. Canonical API v1 routes and shorter compatibility routes call the same service. Solana RPC is authoritative for cluster/mint state; an optional HTTP market provider can enrich price/liquidity fields but cannot influence launch, checkout, treasury or settlement authority.

## Solana read plane

The Solana read plane is a single backend service shared by all route families. `SolanaReadService` owns RPC fallback, health, program verification, mint inspection and market composition. Compatibility routes and website-origin proxies never implement independent chain logic.

```text
Browser
  ↓ same-origin /api/...
Next.js website proxy
  ↓ server-only POWERCHAIN_API_INTERNAL_URL
Backend centralized HTTP boundary
  ↓
SolanaReadService
  ├─ RPC fallback → health / slot / block / version / blockhash
  ├─ program verification
  ├─ SPL / Token-2022 mint inspection
  └─ market resolver
       ├─ Pyth (explicit feed mapping)
       ├─ CoinGecko
       ├─ CoinMarketCap
       └─ optional normalized provider
```

Provider secrets never cross the server boundary. RPC is authoritative for mint identity and supply; market providers enrich only market fields.

## Sui read plane

The Sui operational read plane mirrors the Solana API architecture without forcing Solana JSON-RPC semantics onto Sui. `apps/backend/lib/sui/service.ts` uses `@powerchain/sui`'s gRPC fallback pool and Mysten's Core API/service clients. The canonical v1 routes and short compatibility aliases both terminate in the same service.

```text
Browser / operator
        ↓
Next.js website-origin /api rewrites
        ↓
Backend centralized HTTP boundary
        ↓
SuiReadService
   ├── Core API: chain identifier / gas / system / protocol
   ├── LedgerService: checkpoint / epoch
   ├── MovePackageService: package deployment verification
   └── StateService: coin info / supply / TreasuryCap metadata
        ↓
Primary + fallback Sui gRPC full nodes
```

An optional normalized market adapter may enrich USD market fields, but it cannot override gRPC-derived coin type, decimals, supply or supply policy. Provider failure degrades to gRPC-only data.
