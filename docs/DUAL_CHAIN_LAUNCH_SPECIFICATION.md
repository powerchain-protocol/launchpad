# PowerChain Launchpad™ — Solana + Sui Token Launch Specification

**Version:** 1.0.0  
**Status:** Production-oriented architecture and implementation specification  
**Date:** 23 August 2026  
**Product:** PowerChain Launchpad™

> **Core rule:** One creator flow. Two chain-native implementations. Two creator wallet approvals. One immutable graduation decision.

# 1. Executive Summary

PowerChain Launchpad is extended from a Solana-first token-sale application into a dual-chain token launch system for Solana and Sui. The product presents one consistent creator experience while keeping execution native to each chain. The launch contract is intentionally strict: the creator completes two wallet approval stages, the launch configuration is verified on-chain before lifecycle state advances, and the graduation venue becomes immutable after the second transaction is confirmed.

> **Canonical product rule:** One creator flow, two chain-native implementations, two creator wallet approvals, one immutable graduation decision.

The first approval creates the token primitive. On Solana, this means creating and initializing an SPL Token-2022 mint with the required metadata extensions. On Sui, this means publishing a fresh compiled Move package generated from a controlled token template. The second approval initializes the PowerChain launch configuration: bonding-curve parameters, payout splits, launch protection, graduation destination and an optional creator dev-buy.

When the creator enables dev-buy vesting, the purchased tokens must not be transferred to an unlocked creator account first. The purchase output is routed directly into a VestingLock in the same atomic chain transaction. This is a hard invariant because it prevents a UI or middleware race from temporarily exposing tokens that the creator explicitly chose to lock.

Version 1.0.0 adds post-core controls without adding another creator signature: per-wallet purchase caps, launch windows, restricted eligibility phases, venue previews, progressive vesting, normalized cross-chain analytics, Tx 2 simulation, governance-approved graduation adapters, signed configuration snapshots and indexer/webhook-assisted reconciliation. These capabilities all resolve before or after the existing Tx 2 boundary; none creates a third launch authorization step.

| Area | Solana | Sui |
| --- | --- | --- |
| Token primitive | SPL Token-2022 mint | Fresh Move package / coin type |
| Creator approval 1 | Create and initialize mint | Publish compiled token package |
| Creator approval 2 | Initialize launch + optional dev-buy/vesting | Configure launch PTB + optional dev-buy/vesting |
| Graduation venues | Raydium, Meteora, Orca | Cetus, DeepBook, Turbos |
| Venue mutability | Immutable after Tx 2 confirmation | Immutable after Tx 2 confirmation |
| Fixed launch fee in this specification | None defined | 2 SUI |

# 2. Scope, Status and Normative Language

This document is the canonical engineering and product specification for the Solana + Sui token launch flow in PowerChain Launchpad. It defines product behavior, chain boundaries, state transitions, API responsibilities, persistence rules, transaction review requirements, security invariants and acceptance criteria.

## 2.1 In scope

- Solana Token-2022 deployment and launch configuration.
- Sui Move-package token deployment and launch configuration.
- Two-stage wallet approval UX.
- Bonding-curve configuration and graduation threshold storage.
- Chain-specific graduation destinations.
- Payout splits, anti-bot delay, optional dev-buy and optional vesting.
- Server-side prepare/confirm APIs and on-chain verification.
- Creator Console review, signing, recovery and status surfaces.
- Per-wallet initial purchase limits and configurable launch windows.
- Public, allowlist and private launch policy binding through the existing eligibility architecture.
- Venue-specific graduation previews and Tx 2 simulation.
- Creator-configurable linear/progressive vesting templates.
- Cross-chain launch analytics normalization.
- Governance-controlled graduation adapter registry/version pinning.
- Signed configuration snapshots and transaction review hashes.
- Indexer/webhook-assisted reconciliation with RPC verification fallback.
- Database constraints, auditability, idempotency and observability.

## 2.2 Out of scope

- Inventing a new bonding-curve pricing formula. The launch engine consumes the repository's canonical curve implementation.
- Fabricating production DEX program/package IDs, vault addresses or treasury accounts.
- Custodial signing, private-key storage or server-side wallet impersonation.
- Changing a graduation venue after launch configuration has reached confirmed finality.
- Treating Solana and Sui transaction mechanics as interchangeable.

> **Normative language:** MUST / MUST NOT define required invariants. SHOULD / SHOULD NOT define strongly recommended production behavior. MAY identifies an optional implementation choice.

# 3. Product Principles

- Wallet custody stays with the creator. PowerChain prepares transactions; it does not sign for the user.
- The launch UI is chain-agnostic at the workflow level and chain-native at the execution level.
- Every irreversible setting is shown before signing, with immutable values explicitly marked.
- The server never trusts a frontend success flag as proof that a transaction executed.
- On-chain state is the source of truth for deployment, launch activation, vesting and graduation.
- A failed Tx 2 must not leave a partially configured launch.
- Optional security features must fail closed. If vested dev-buy routing cannot be constructed, Tx 2 preparation fails.
- Tx 2 preparation MUST pin a governance-approved graduation adapter and produce a signed configuration snapshot.
- Tx 2 confirmation MUST reject a submitted transaction whose recovered configuration hash differs from the reviewed snapshot.
- Indexer or webhook events may accelerate reconciliation but MUST NOT bypass RPC/on-chain verification.
- No arbitrary creator-authored Move source is compiled by the production service.

> **Human authorization boundary:** AI may draft parameters, backend services may validate and transaction builders may assemble instructions, but the connected wallet is the authority that approves and signs the launch.

# 4. System Architecture

The implementation uses a shared domain contract with chain-specific adapters. The shared layer owns invariants and lifecycle semantics. Solana and Sui packages translate the shared launch request into native transaction material. Backend services prepare and verify. Frontend components present exact review objects before wallet invocation.

```text
Creator Console
      |
      +----> Graduation Preview / Tx 2 Simulation
      |
      v
Shared Launch Domain
      |
      +----> Eligibility policy reference
      +----> Governance-approved adapter registry
      +----> Canonical configuration snapshot + review hash
      |
  +---+-------------+
  |                 |
  v                 v
Solana Adapter     Sui Adapter
  |                 |
  v                 v
Solana RPC         Sui RPC / gRPC
  |                 |
  +--------+--------+
           |
           v
   Backend Verification
           |
   +-------+--------+
   |                |
   v                v
Prisma / Supabase  Indexer/Webhook hints
+ Audit Log         (never authoritative)
```

## 4.1 Monorepo boundaries

```text
packages/domain/src/launch/
packages/solana/src/launch/
packages/sui/src/launch/
packages/program-client/src/launch/
apps/backend/lib/launches/
apps/backend/app/api/v1/launches/
apps/frontend/components/creator-console/
programs/sui/token-template/
programs/sui/launchpad/
prisma/migrations/
```

The Solana implementation should reuse the repository's existing wallet, RPC and transaction composition stack. The Sui package is a dedicated adapter because Move package publication, coin objects, Programmable Transaction Blocks and shared objects require different semantics.

# 5. Canonical Launch Lifecycle

```text
DRAFT
  |
  v
TOKEN_DEPLOY_PENDING
  |  Tx 1 verified
  v
TOKEN_DEPLOYED
  |
  v
LAUNCH_CONFIG_PENDING
  |  Tx 2 verified
  v
LIVE
  |  curve reaches threshold
  v
GRADUATION_READY
  |
  v
GRADUATING
  |
  v
GRADUATED
```

FAILED is terminal for a specific attempt but does not imply the creator cannot create a replacement launch. Recovery behavior depends on the stage. A token that was successfully deployed in Tx 1 remains a real chain object even if Tx 2 is never signed; the application must show it as deployed but not live.

| State | Meaning | Allowed next action |
| --- | --- | --- |
| DRAFT | Configuration is editable and no launch transaction is pending. | Prepare Tx 1 |
| TOKEN_DEPLOY_PENDING | Unsigned/signed Tx 1 exists or confirmation is being verified. | Confirm or recover Tx 1 |
| TOKEN_DEPLOYED | Token primitive exists on-chain. | Prepare Tx 2 |
| LAUNCH_CONFIG_PENDING | Tx 2 exists or confirmation is being verified. | Confirm or recover Tx 2 |
| LIVE | Launch configuration is active; graduation venue is locked. | Trade / monitor curve |
| GRADUATION_READY | Threshold conditions are satisfied. | Prepare graduation |
| GRADUATING | Graduation transaction is in flight. | Confirm graduation |
| GRADUATED | Destination liquidity venue is active. | Read-only lifecycle completion |

> **No lifecycle shortcuts:** DRAFT -> LIVE is invalid. Tx 1 and Tx 2 are separate authorization boundaries and must each be confirmed from chain data.

# 6. Creator Console Launch Wizard

The Creator Console uses one wizard for both networks. Chain selection changes the fields and transaction preview without changing the overall mental model. Version 1.0.0 adds access controls, graduation preview, vesting templates and simulation before Tx 2, while preserving exactly two creator wallet approvals.

| Step | Purpose | Key validation |
| --- | --- | --- |
| 1. Network | Choose Solana or Sui. | Supported chain and connected-wallet compatibility. |
| 2. Token | Name, symbol, description, icon, decimals. | Length, URI, decimals and sanitization. |
| 3. Curve | Initial price and graduation threshold. | Positive atomic values and supported curve type. |
| 4. Payouts | Creator/treasury/partner splits. | Unique recipients; total = 10,000 bps. |
| 5. Graduation | Choose DEX/venue. | Venue belongs to selected chain; active governed adapter exists. |
| 6. Access | Wallet cap, launch window, public/allowlist/private policy. | Positive cap; valid window; restricted modes reference existing eligibility policy + commitment. |
| 7. Protection | Optional anti-bot delay. | Bounded non-negative delay. |
| 8. Dev Buy | Optional initial creator purchase. | Positive amount and supported payment asset. |
| 9. Vesting | Optional linear or progressive template for dev-buy output. | Schedule valid; progressive tranches sum to 10,000 bps. |
| 10. Graduation Preview | Show venue-specific initial-liquidity estimate and pool parameters. | Adapter version is governance-approved and source assumptions are visible. |
| 11. Tx 1 | Deploy token primitive. | Wallet review + chain confirmation. |
| 12. Tx 2 Simulation | Dry-run expected launch effects before signing. | Token is deployed; configuration hash generated; simulation warnings visible. |
| 13. Tx 2 Review | Signed snapshot, exact effects, adapter version and review hash. | Snapshot hash/signature valid; no hidden derived values. |
| 14. Tx 2 | Activate launch. | Wallet review + chain confirmation; recovered review hash must match. |
| 15. Live | Show launch status, analytics and immutable venue/adapter. | On-chain configuration reconciled. |

> **UX requirement:** The graduation selector must display: “This choice is written on-chain in transaction 2 and cannot be changed after confirmation.”

> **Integrity requirement:** The final Tx 2 review must show the SHA-256 configuration hash and the pinned graduation adapter/version. The launch is not confirmed if RPC verification recovers a different hash.

# 7. Shared Domain Contract

The domain layer is responsible for expressing launch intent without chain SDK objects. This keeps business invariants testable and prevents UI code from embedding chain-specific rule branches.

```text
type LaunchChain = "solana" | "sui";

type GraduationVenue =
  | { chain: "solana"; venue: "raydium" | "meteora" | "orca" }
  | { chain: "sui"; venue: "cetus" | "deepbook" | "turbos" };

interface LaunchDraft {
  id: string;
  chain: LaunchChain;
  creatorWallet: string;
  token: TokenDefinition;
  curve: CurveConfig;
  payoutSplits: PayoutSplit[];
  graduation: GraduationVenue;
  antiBot: AntiBotConfig;
  initialPurchaseLimit?: InitialPurchaseLimitConfig;
  launchWindow?: LaunchWindowConfig;
  eligibility?: LaunchEligibilityConfig;
  devBuy?: DevBuyConfig;
}
```

## 7.1 Core validation rules

- Graduation chain MUST equal launch chain.
- Solana venues MUST NOT be accepted for Sui and vice versa.
- Payout recipients MUST be unique within a launch.
- Payout basis points MUST sum to exactly 10,000.
- Initial price and graduation threshold MUST be positive atomic values.
- Disabled anti-bot protection MUST store a zero delay.
- Enabled dev-buy MUST have a positive amount and a payment asset.
- Enabled linear vesting MUST have a positive duration and cliff <= duration.
- Progressive vesting tranches MUST be strictly ordered and sum to exactly 10,000 bps.
- Enabled per-wallet limits MUST contain a positive atomic maximum.
- Enabled launch windows MUST contain valid timestamps with closesAt > opensAt.
- Restricted eligibility modes MUST reference an existing policy ID and immutable policy commitment.
- Tx 2 MUST resolve an active governance-approved adapter for the selected venue.
- Tx 2 MUST commit a 32-byte SHA-256 review hash generated from canonical launch parameters.
- Once graduationVenueLocked is true, changing either chain or venue MUST fail.

# 8. Solana - Transaction 1: Create Token-2022 Mint

Solana does not publish a new program for every token. Tx 1 creates an SPL Token-2022 mint owned by the Token-2022 program and initializes the extension set required by the PowerChain token-launch profile.

> **Approval semantics:** The product exposes one creator-wallet approval for Tx 1. Solana may also require a locally generated mint-account signer. That auxiliary signer must not introduce a third creator authorization prompt or leave private key material on the server.

## 8.1 Required instruction plan

1. Create the mint account with sufficient rent-exempt space for the selected extensions.
2. Initialize MetadataPointer before mint initialization.
3. Initialize the Token-2022 mint with creator-approved decimals and authorities.
4. Initialize TokenMetadata on the mint or link the canonical metadata account/URI according to the repository adapter.
5. Initialize any additional extensions required by the product before mint initialization when the Token-2022 extension requires pre-initialization allocation.

## 8.2 Token metadata model

The application-level token model always includes name, symbol, description and icon URI. Token-2022 metadata natively centers on name, symbol and URI; description may be represented in the referenced metadata document or as an additional metadata field. The backend must preserve the canonical description even when the chain encoding is indirect.

```text
Token-2022 program:
TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb

Required profile:
- MetadataPointer
- TokenMetadata
- configured decimals
- explicit mint/freeze authority policy
```

## 8.3 Tx 1 confirmation

- Confirm the transaction signature exists and reached the configured commitment/finality policy.
- Fetch the mint account and verify its owner is the Token-2022 program.
- Verify decimals and required extensions.
- Verify metadata values or the canonical metadata URI hash/contents according to adapter policy.
- Verify mint/freeze authorities match the launch policy.
- Persist the mint address and Tx 1 signature only after verification succeeds.

# 9. Solana - Transaction 2: Configure Launch

Tx 2 initializes the launch PDA/state, bonding-curve state, payout configuration, graduation venue and optional launch protection. Optional dev-buy and vesting instructions are included in the same Solana transaction whenever the creator selects them. Version 1.0.0 also pins the approved graduation adapter/version, wallet cap, launch window, eligibility commitment and signed review hash in the same transaction.

```text
Tx 2 - Solana
  initializeLaunch
  configureCurve
  configurePayouts
  storeGraduationVenue  [immutable]
  configureAntiBot      [optional]
  devBuy                 [optional]
  initializeDevVesting  [optional, same tx]
  -> wallet signs
  -> RPC submission
  -> backend verifies accounts + instruction effects
```

## 9.1 Solana graduation venue enum

| Value | Display name | Stored code |
| --- | --- | --- |
| raydium | Raydium | 0 |
| meteora | Meteora | 1 |
| orca | Orca | 2 |

The exact on-chain enum representation may be Rust enum discriminants rather than raw u8 values. The important invariant is deterministic mapping and the absence of an instruction that can mutate the venue after launch initialization.

## 9.2 No fixed Solana launch fee in this flow

This specification does not introduce a fixed Solana launch fee analogous to the Sui 2 SUI fee. Solana rent, network fees and any existing PowerChain service-fee policy remain separate concerns and must be displayed individually in the review screen. A deployment may later define a fixed Solana launch fee through governance/configuration, but it must not be silently inferred from the Sui fee.

# 10. Sui - Transaction 1: Publish Fresh Token Package

Tx 1 publishes a fresh Move package compiled from a controlled PowerChain token template. The creator chooses name, symbol, description, icon and decimals; those values are validated and safely injected into the template or represented as constructor inputs. The production service must never compile unrestricted source text supplied by a user.

## 10.1 Controlled compilation pipeline

```text
Creator metadata
      |
      v
Validation + normalization
      |
      v
PowerChain token template
      |
      v
Move build / compiled bytecode
      |
      v
Tx 1 publish()
      |
      v
Package ID + coin type + TreasuryCap
```

- Module and witness identifiers are derived from sanitized internal identifiers, not pasted source code.
- String values are escaped before template generation.
- Decimals are validated before compilation.
- The compiled package dependencies are resolved from a controlled build environment.
- The creator wallet signs the publish transaction.
- The backend verifies the package and expected token object/capability outputs before marking TOKEN_DEPLOYED.

## 10.2 Package upgrade policy

Publication creates an UpgradeCap unless package policy removes or constrains it. PowerChain should make the token-package upgrade policy explicit in the review flow. This is separate from graduation venue immutability: the graduation destination is stored in the launch configuration created in Tx 2 and must not depend on a mutable frontend setting.

# 11. Sui - Transaction 2: Configure Launch PTB

Sui Tx 2 is a single Programmable Transaction Block. It pays the fixed launch fee, creates the immutable launch configuration, configures payout splits, stores curve parameters, stores the graduation venue, applies optional anti-bot delay and optionally performs a creator dev-buy. If vesting is enabled, the dev-buy Coin<T> is consumed directly by the VestingLock call before launch activation.

> **Fixed launch fee:** PowerChain Sui launch fee: exactly 2 SUI (2,000,000,000 MIST) at the launch configuration layer. Network gas is separate.

```text
Tx 2 - Sui PTB
  tx.coin({ balance: 2_000_000_000 MIST })
  create_launch<T>(...) -> Launch<T>
  canonical_curve_dev_buy(...) -> Coin<T>       [optional]
  vesting::lock_from_launch(Coin<T>, ...)        [optional]
  activate_launch<T>(Launch<T>)
  -> wallet signs
  -> execute atomically
```

## 11.1 Why launch activation is last

The launch object is kept transaction-local while optional dev-buy and vesting commands are composed. Only after those commands are complete is the Launch<T> shared or otherwise activated. This ordering ensures that the optional lock is part of the same atomic state transition and prevents a purchase result from being exposed between transactions.

## 11.2 Sui graduation venue enum

| Value | Display name | Stored code |
| --- | --- | --- |
| cetus | Cetus | 0 |
| deepbook | DeepBook | 1 |
| turbos | Turbos | 2 |

# 12. Graduation Venue Model

Graduation is the transition from the PowerChain bonding curve into a creator-selected external liquidity venue. Venue selection happens before Tx 2 is signed. The selected venue is stored on-chain and becomes immutable when Tx 2 is verified.

| Chain | Supported venues | When selected | Can change later? |
| --- | --- | --- | --- |
| Solana | Raydium / Meteora / Orca | Creator review before Tx 2 | No |
| Sui | Cetus / DeepBook / Turbos | Creator review before Tx 2 | No |

## 12.1 Immutability enforcement

1. Domain validation rejects mutation once graduationVenueLocked is true.
2. API routes expose no “update graduation venue” operation after launch configuration.
3. The on-chain launch state has no administrative venue setter.
4. The persistence layer uses a database trigger/check to reject chain/venue changes once locked.
5. Graduation workers read the stored on-chain venue rather than accepting a new venue in the graduation request.

> **Critical invariant:** A graduation transaction must route only to the venue encoded in the launch state. A caller-supplied alternate venue is invalid even if the creator wallet signs the later transaction.

# 13. Bonding Curve Integration

The dual-chain work must not create separate curve economics simply because Sui uses a different SDK. Both adapters consume the canonical PowerChain curve model and translate it into chain-native instructions or Move calls.

## 13.1 Shared curve inputs

- Curve kind: bonding-curve.
- Initial price in chain-appropriate atomic units.
- Graduation threshold in atomic units.
- Current reserves / sold supply as maintained by the canonical program/module.
- Any fee parameters already defined by the PowerChain launch economics package.

## 13.2 Sui dev-buy composer port

When dev-buy is enabled, the Sui launch builder requires a canonical curve composer. The composer receives the transaction, launch request, transaction-local Launch<T> and token type. It returns the purchased Coin<T> without transferring it. The launch builder then transfers the coin to the creator or routes it into VestingLock.

```text
type SuiDevBuyComposer = (ctx) => TransactionResult;

// Requirement:
// - consume canonical curve logic
// - return purchased Coin<T>
// - do not transfer Coin<T>
// - do not commit a second pricing formula
```

# 14. Payout Splits and Fees

## 14.1 Payout splits

Payout splits define how launch economics are distributed to configured recipients. Each recipient address must be valid for the selected chain, unique within the launch and assigned a positive basis-point amount.

```text
sum(payoutSplits[].basisPoints) == 10_000

Example:
Creator      7,000 bps = 70%
Treasury     2,000 bps = 20%
Partner      1,000 bps = 10%
TOTAL       10,000 bps = 100%
```

## 14.2 Fee presentation

| Fee | Solana | Sui |
| --- | --- | --- |
| Launch fee | No fixed amount defined by this spec | 2 SUI fixed |
| Network fee | Wallet/RPC estimate | Gas estimate |
| Account/rent cost | Show separately when applicable | Not represented as Solana-style rent |
| PowerChain sale/service fee | Use existing product policy | Use existing product policy if applicable |

The review UI must avoid combining protocol/network fees with PowerChain fees into one opaque number. Users must be able to distinguish application fees from chain execution costs.

# 15. Anti-Bot Launch Protection

Anti-bot protection is an optional delay applied at launch. The shared domain stores enabled/disabled state plus delaySeconds; chain adapters convert that value to native time/slot representations.

- Disabled protection stores delay = 0.
- The default maximum in the shared implementation is 3,600 seconds unless governance/configuration intentionally changes it.
- On Sui, the adapter converts seconds to milliseconds for clock-based Move logic.
- On Solana, the program may use slots or timestamps; the adapter must document the conversion and review output.
- The delay must be shown before Tx 2 signing and becomes part of the launch configuration.

Anti-bot delay is not a substitute for broader launch protections such as per-wallet limits, allowlists or market-specific anti-MEV controls. Those can be added as separate policy modules without weakening the two-signature flow.

# 16. Creator Dev-Buy and Vesting

A dev-buy allows the creator to acquire tokens during launch configuration. It is optional and must never be silently enabled. The transaction review shows payment asset, payment amount, estimated/derived token result where available, and whether the output is immediately liquid or vested.

## 16.1 Non-vested dev-buy

```text
Payment asset
    -> canonical bonding curve
    -> purchased tokens
    -> creator token account / Coin<T>
```

## 16.2 Vested dev-buy

```text
Payment asset
    -> canonical bonding curve
    -> purchased tokens
    -> VestingLock
       beneficiary = creator
       cliff = configured
       duration = configured

All operations occur in Tx 2.
```

> **Fail-closed rule:** If the creator selected vesting and the chain adapter cannot construct an atomic purchase-to-lock path, transaction preparation MUST fail. It must not downgrade to an unlocked dev-buy.

## 16.3 Vesting schedule validation and templates

- duration > 0.
- cliff >= 0.
- cliff <= duration.
- beneficiary must equal the configured creator unless the UI explicitly supports another beneficiary in a future version.
- The confirmed vesting object/PDA address is persisted and surfaced in launch details.

# 17. Transaction Review and Wallet Signing

Every wallet invocation is preceded by a PowerChain review object. The review is not a marketing summary; it is a structured representation of the transaction that will be serialized and passed to the wallet.

## 17.1 Tx 1 review

- Network.
- Creator wallet.
- Token name and symbol.
- Solana: Token-2022 mint and extension plan.
- Sui: fresh Move package publication.
- Estimated network fee/gas.
- Relevant authority policy.

## 17.2 Tx 2 review

- Launch fee and network fee/gas shown separately.
- Bonding-curve parameters.
- Graduation venue with an immutable badge.
- All payout recipients and basis points.
- Anti-bot delay.
- Dev-buy amount and payment asset.
- Vesting cliff/duration and direct-lock status.
- Exact instruction/Move-call list in an expandable technical panel.

> **Signing rule:** The UI should say “Review in wallet & sign Tx 1” and “Review in wallet & sign Tx 2.” It must not imply that clicking a PowerChain button itself executes the transaction.

# 18. API v1

The API keeps transaction construction, simulation and confirmation separate. Prepare endpoints return unsigned wallet material; simulation returns expected Tx 2 effects; confirmation always performs chain verification. Preview/analytics endpoints are read-only. Webhook ingestion is an acceleration path only.

```text
POST /api/v1/launches
GET  /api/v1/launches/:id

POST /api/v1/launches/:id/token/prepare
POST /api/v1/launches/:id/token/confirm

POST /api/v1/launches/:id/configure/simulate
POST /api/v1/launches/:id/configure/prepare
POST /api/v1/launches/:id/configure/confirm

GET  /api/v1/launches/:id/graduation/preview
GET  /api/v1/launches/analytics

POST /api/v1/launches/reconcile/webhook/:provider
```

The application MAY expose equivalent eligibility and vesting-template CRUD routes through existing API modules; those routes do not change the launch-signature state machine.

## 18.1 Prepare response

```text
{
  "launchId": "...",
  "chain": "sui",
  "stage": "LAUNCH_CONFIG",
  "serialized": "...",
  "encoding": "base64-bcs",
  "review": {
    "title": "Configure token launch",
    "immutableFacts": ["Graduation venue: cetus"],
    "instructions": [...]
  }
}
```

## 18.2 Confirm request

```text
POST /api/v1/launches/:id/configure/confirm
{
  "transactionId": "<chain transaction id>"
}
```

A confirm route must not accept “success: true” as proof. It receives the transaction identifier, loads the launch, checks the expected stage, asks the chain adapter to verify effects and only then persists the next lifecycle state.

# 19. Persistence and Data Model

The launch record stores chain-neutral lifecycle fields plus chain-specific identifiers. Payout splits and dev-buy details are normalized so they can be audited independently of the main launch row.

| Field | Purpose |
| --- | --- |
| chain | solana or sui. |
| creator_wallet | Wallet that owns the launch flow. |
| token_address | Solana mint or canonical token identifier. |
| sui_package_id | Sui package identifier when applicable. |
| status | Canonical lifecycle state. |
| graduation_venue | Chain-specific selected venue. |
| graduation_venue_locked | True only after verified Tx 2. |
| anti_bot_delay_seconds | Normalized shared representation. |
| token_deploy_tx | Verified Tx 1 identifier. |
| configure_tx | Verified Tx 2 identifier. |
| vesting_address | PDA/object address when a dev lock exists. |

## 19.1 1.0.0 persistence additions

```text
sales
  max_initial_purchase_per_wallet_atomic
  launch_window_open_at / launch_window_close_at
  eligibility_mode / eligibility_policy_id / eligibility_commitment
  graduation_adapter_registry_id / graduation_adapter_id / graduation_adapter_version
  graduation_adapter_config_hash
  review_hash / review_signature / review_key_id

graduation_adapter_registry
  chain / venue / adapter_id / version / status
  registry_entry_address / config_hash
  governance_proposal_id / approved_at

launch_configuration_snapshots
  review_hash / signature / key_id / canonical_payload

vesting_templates
  schedule_kind / schedule JSON

launch_reconciliation_events
  provider / provider_event_id / stage / transaction_id / outcome

launch_analytics_snapshots
  quote volume / holders / sold / graduation threshold / source / observed_at
```

The database must allow only one active adapter per chain/venue at a time for new launch preparation. Existing launches keep their pinned adapter/version for historical reproducibility.

## 19.2 Database-level immutability

The database enforces chain/venue consistency and rejects updates to chain or graduation_venue when graduation_venue_locked is true. This is a defense-in-depth control; the database is not the source of truth for the venue, but it prevents application bugs from rewriting historical launch metadata.

```text
IF OLD.graduation_venue_locked = TRUE AND
   (NEW.graduation_venue IS DISTINCT FROM OLD.graduation_venue OR
    NEW.chain IS DISTINCT FROM OLD.chain)
THEN
  RAISE EXCEPTION 'graduation venue is immutable after configuration';
END IF;
```

# 20. On-Chain Verification and Reconciliation

Verification adapters are the gate between a submitted wallet transaction and persisted lifecycle progress. They validate expected effects, not only transaction existence.

## 20.1 Solana verification

- Fetch transaction and ensure it succeeded.
- Validate expected program IDs and launch accounts.
- For Tx 1, fetch mint state and required Token-2022 extensions.
- For Tx 2, fetch LaunchConfig/curve state and compare creator, mint, venue, payouts, delay and threshold.
- When vested dev-buy is enabled, verify the vesting account exists and the purchase output was not delivered to an unlocked creator account.
- Use the application's configured commitment/finality policy before marking confirmed.

## 20.2 Sui verification

- Fetch transaction effects and require success.
- For Tx 1, identify the published package and expected coin type/capability outputs.
- For Tx 2, inspect created/shared launch state and verify the 2 SUI fee transfer, venue code, payout vectors, threshold and delay.
- If dev vesting is enabled, verify the VestingLock object and beneficiary.
- Persist package/object identifiers from verified effects rather than frontend-provided guesses.

## 20.3 Indexer/webhook acceleration and RPC fallback

A background reconciliation job should revisit pending transactions that were submitted but whose client disconnected before confirmation. This avoids requiring the user to remain on the page while finality is reached. Reconciliation is read-only with respect to signing; it only observes chain state and updates verified lifecycle metadata.

# 21. Security and Trust Boundaries

| Boundary | Required control |
| --- | --- |
| Wallet | No private keys or seed phrases are requested, stored or proxied. |
| Frontend | Treat review data as display input; never self-assert confirmation. |
| Backend | Authenticate creator, validate chain/address, rate limit prepare/confirm, enforce idempotency. |
| Transaction builder | Deterministic instruction order; fail closed on missing required composer/config. |
| Move compilation | Controlled template only; no arbitrary user source. |
| Programs/modules | No post-launch graduation venue setter. |
| Database | Immutable-venue trigger and append-only audit events for sensitive state. |
| External DEX adapters | Venue-specific IDs from configuration; no hard-coded fabricated production addresses. |

## 21.1 Required authorization checks

- Only the launch creator or an explicitly authorized role may prepare creator-side launch transactions.
- The wallet used to sign must match the creator wallet expected by the launch unless a supported authority-transfer flow exists.
- Backend session identity and wallet ownership proof should be correlated before write operations.
- All prepare endpoints should use idempotency keys or deterministic active-attempt records to prevent duplicate drafts/transactions.
- All decoded transaction effects must be validated against the launch ID and expected stage to prevent confirmation of an unrelated transaction.

> **Never accept transaction substitution:** A valid transaction from the same wallet is not sufficient. The verifier must prove that the transaction created/configured the specific launch with the expected immutable parameters.

# 22. Observability, Audit and Provenance

Launch operations are security-sensitive and financially relevant. Every prepare, submission, verification, failure and reconciliation event should produce structured telemetry with requestId, correlationId, launchId, wallet, chain and stage.

| Event | Minimum fields |
| --- | --- |
| launch.created | launchId, creator, chain |
| launch.token.prepared | launchId, chain, reviewHash, requestId |
| launch.token.confirmed | launchId, txId, tokenAddress/packageId |
| launch.configure.prepared | launchId, venue, devBuyEnabled, vestingEnabled |
| launch.configure.confirmed | launchId, txId, venue, vestingAddress |
| launch.verification.failed | launchId, stage, txId, reason |
| launch.graduation.ready | launchId, threshold evidence |
| launch.graduated | launchId, venue, pool/object address, txId |

Audit records should distinguish user intent, transaction material, wallet-submitted transaction identifiers and verified chain effects. This creates a clear provenance trail without storing secret wallet material.

# 23. Error and Recovery Model

| Failure | Expected behavior |
| --- | --- |
| Tx 1 rejected in wallet | Remain DRAFT or return to DRAFT; no chain state assumed. |
| Tx 1 submitted but UI disconnects | Reconciliation checks transaction and advances if verified. |
| Tx 1 fails on-chain | Mark attempt failed; do not set token address/package ID. |
| Tx 1 succeeds; Tx 2 never signed | Show TOKEN_DEPLOYED with Resume Launch action. |
| Tx 2 rejected in wallet | Return to TOKEN_DEPLOYED when no transaction was submitted. |
| Tx 2 fails on-chain | Do not lock venue in DB; display retry/review state. |
| Confirmation endpoint receives wrong tx | Reject with verification error; state unchanged. |
| Vesting composer unavailable | Refuse Tx 2 preparation when vesting is enabled. |
| RPC unavailable | Return retryable infrastructure error; do not guess state. |

The UI should distinguish user cancellation, validation failure, simulation failure, RPC failure, on-chain program error and verification mismatch. A single generic “transaction failed” message makes support and recovery unnecessarily difficult.

# 24. API Error Contract

Errors should use stable machine-readable codes plus a safe human-readable message. Internal stack traces and raw provider secrets must never be returned to the client.

```text
{
  "error": {
    "code": "LAUNCH_CONFIG_CONFIRM_FAILED",
    "message": "Launch configuration could not be verified on-chain.",
    "requestId": "req_...",
    "retryable": false
  }
}
```

| Code | Meaning |
| --- | --- |
| INVALID_LAUNCH_STATE | Requested operation is not valid in current lifecycle state. |
| INVALID_GRADUATION_VENUE | Venue does not belong to selected chain. |
| PAYOUT_SPLIT_INVALID | Recipients or 10,000 bps invariant failed. |
| TRANSACTION_PREPARE_FAILED | Builder/simulation/configuration failure. |
| TRANSACTION_NOT_FOUND | Submitted ID is not yet observable. |
| CHAIN_VERIFICATION_FAILED | Effects do not match the expected launch. |
| WALLET_MISMATCH | Signer/creator mismatch. |
| VESTING_COMPOSITION_REQUIRED | Vested dev-buy cannot be built safely. |
| RPC_UNAVAILABLE | Chain provider unavailable or timed out. |

# 25. Testing and Validation

## 25.1 Domain unit tests

- All valid and invalid chain/venue combinations.
- Payout totals: 9,999, 10,000 and 10,001 bps.
- Duplicate payout recipients.
- Anti-bot boundaries and disabled-delay invariant.
- Dev-buy/vesting amount and schedule validation.
- All allowed lifecycle transitions and all forbidden shortcuts.
- Graduation venue mutation before and after lock.

## 25.2 Solana integration tests

- Token-2022 mint initialization with required extensions.
- Tx 1 confirmation reconstructs expected mint metadata.
- Tx 2 stores the correct venue and cannot mutate it.
- Dev-buy + vesting instructions are in one transaction.
- Wrong mint, wrong creator, wrong venue or unrelated transaction is rejected by verifier.

## 25.3 Sui Move / PTB tests

- Fresh token package publication produces expected package/capabilities.
- create_launch rejects invalid venue codes and payout totals.
- create_launch rejects any launch fee other than 2 SUI.
- Tx 2 dev-buy output can be consumed by VestingLock before activation.
- There is no callable graduation venue setter.
- Verifier reads the venue from created/shared launch state.

## 25.4 End-to-end scenarios

| Scenario | Expected result |
| --- | --- |
| Solana basic launch | Two creator approvals -> LIVE. |
| Sui basic launch | Two creator approvals -> LIVE; 2 SUI fee verified. |
| Sui vested dev-buy | Purchase output exists only inside VestingLock after Tx 2. |
| Wrong chain venue | Blocked before transaction preparation. |
| Tx 2 reconnect | Pending state is reconciled from chain. |
| Graduation mutation attempt | Rejected by domain, API/on-chain design and DB trigger. |

## 25.5 Post-core capability tests

- Wallet-limit tests cover cumulative purchases and exact-boundary acceptance.
- Launch-window tests cover pre-open, exact-open, exact-close and post-close timestamps.
- Restricted eligibility tests require a policy ID + commitment and exercise existing allowlist/private verification.
- Graduation preview tests verify the selected governed adapter/version and deterministic assumptions.
- Progressive vesting tests prove ordered tranches, 10,000 bps total and partial claims.
- Analytics tests normalize volume without floating-point token arithmetic and clamp curve progress to 10,000 bps.
- Tx 2 simulation tests return the same configuration hash later used by preparation.
- Governance-registry tests reject disabled/deprecated adapters for new launches.
- Review-integrity tests mutate one Tx 2 parameter and verify the hash changes; confirmation rejects mismatches.
- Webhook tests cover signature rejection, duplicate delivery, out-of-order delivery and RPC fallback.

# 26. Runtime Configuration

Production identifiers must come from the existing configuration package or secret/configuration management layer. The implementation must never invent addresses to satisfy a missing environment variable.

```text
POWERCHAIN_SOLANA_LAUNCHPAD_PROGRAM_ID=
POWERCHAIN_SUI_LAUNCHPAD_PACKAGE_ID=
POWERCHAIN_SUI_FEE_VAULT=

# Venue adapters / pools / router package IDs:
# configure per environment; do not hard-code guessed mainnet values.
```

## 26.1 Configuration validation

- Fail application startup for missing required production program/package IDs.
- Allow explicit devnet/testnet configuration.
- Do not permit mainnet writes when the application is in simulated/disabled write mode.
- Expose public non-secret network configuration to the frontend through a browser-safe config surface.
- Keep RPC credentials, Helius/API keys and privileged service credentials server-only.

# 27. Monorepo Integration

The dual-chain launch feature should remain modular. Shared types and validation belong in the domain package; transaction composition belongs in chain packages; API orchestration belongs in the backend; user interaction belongs in Creator Console components.

```text
packages/domain
  export * from "./launch/index"

packages/program-client
  export * from "./launch/index"

packages/solana
  export * from "./launch/index"

packages/sui
  dedicated package with ./launch export
```

## 27.1 Do not collapse boundaries

- Do not import Sui SDK objects into shared domain types.
- Do not import Solana wallet adapters into backend domain services.
- Do not perform RPC verification inside React components.
- Do not duplicate graduation enums in several apps; re-export the shared domain constant.
- Do not keep a separate “frontend lifecycle” that can diverge from backend verified state.

# 28. Creator Console UX Requirements

The Launchpad design language remains clean, technical, trustworthy and minimal. The default light theme uses white/light-gray surfaces, black text and dark-green primary actions. Chain context should be visible but not dominate the workflow.

| Component | Required behavior |
| --- | --- |
| Network selector | Choose Solana/Sui before token-specific fields. |
| Graduation cards | Show only venues supported by selected chain. |
| Immutable notice | Persistent warning before Tx 2; locked badge after confirmation. |
| Signature stepper | Clear “Transaction 1 of 2” and “Transaction 2 of 2” states. |
| Review panel | Expandable exact instructions/Move calls and recipients. |
| Fee summary | PowerChain fee separate from network fee/gas. |
| Dev-buy section | Off by default; explicit amount/asset input. |
| Vesting section | Only active with dev-buy; show cliff/duration and atomic-lock explanation. |
| Resume state | Allow creator to continue from verified TOKEN_DEPLOYED after reconnect. |
| Live state | Show token address/package, configure tx, venue, vesting and graduation progress. |

Accessibility requirements include keyboard-operable venue cards, aria-pressed state, descriptive wallet/sign buttons, non-color status cues, focus-visible rings and reduced-motion handling for transaction progress animations.

# 29. Graduation Execution

The launch flow stores the graduation destination but does not hard-code one universal graduation transaction. When the curve reaches the configured threshold, the graduation subsystem selects the adapter indicated by the immutable on-chain venue.

```text
Launch reaches threshold
       |
       v
Read launch state from chain
       |
       +-- Solana: raydium / meteora / orca adapter
       |
       +-- Sui: cetus / deepbook / turbos adapter
       |
       v
Prepare venue-specific graduation
       |
       v
Verify created pool / liquidity position
       |
       v
GRADUATED
```

- Graduation adapters MUST use configured production program/package/router IDs.
- The stored venue is input; no caller may override it.
- The resulting pool/object/position identifier and transaction ID are persisted.
- If a venue is temporarily unavailable, the launch remains GRADUATION_READY; it does not silently graduate elsewhere.
- Retry logic must be idempotent and protect against duplicate pool initialization.

# 30. Production Acceptance Criteria

1. A creator can select Solana or Sui and complete a launch through one Creator Console wizard.
2. The UI requires exactly two creator wallet approval stages for the canonical launch flow.
3. Solana Tx 1 creates and verifies a Token-2022 mint with the configured metadata profile.
4. Sui Tx 1 publishes and verifies a fresh token package built from a controlled template.
5. Sui Tx 2 transfers exactly 2 SUI to the configured launch-fee destination, separate from gas.
6. Payout splits cannot be prepared unless they sum to exactly 10,000 bps.
7. Only Raydium/Meteora/Orca are accepted for Solana; only Cetus/DeepBook/Turbos are accepted for Sui.
8. After Tx 2 verification, the graduation venue cannot be changed through domain, API, database or on-chain interfaces.
9. If vested dev-buy is selected, purchase and lock occur atomically in Tx 2.
10. Backend lifecycle state advances only from verified chain effects.
11. Submitted unrelated transactions cannot satisfy a confirm endpoint.
12. Pending transactions recover correctly after browser refresh/disconnect.
13. All launch writes emit structured audit events with request/correlation identifiers.
14. No production path accepts arbitrary creator Move source or server-side private keys.
15. No production configuration uses fabricated DEX/program/package addresses.
16. Typecheck, unit tests, chain integration tests and application builds pass in the full repository checkout.
17. Per-wallet initial purchase limits are validated and are committed as Tx 2 launch parameters when enabled.
18. Launch windows reject invalid/open-after-close configurations and are visible in the final review.
19. Allowlist/private launches bind to the existing eligibility policy ID plus immutable commitment.
20. Graduation preview resolves only governance-approved adapter versions and exposes parameter assumptions.
21. Progressive vesting templates support partial claims and preserve the atomic dev-buy-to-lock invariant.
22. Cross-chain analytics normalize volume, holders and curve progress without fabricating missing price data.
23. Tx 2 simulation returns the expected effect model and a configuration hash before wallet signing.
24. Tx 2 prepare persists a SHA-256 review hash signed by the configured Ed25519 review key.
25. Tx 2 confirmation fails when the chain-recovered review hash differs from the signed snapshot.
26. Webhook/indexer delivery can accelerate reconciliation but cannot bypass RPC/on-chain verification.

# 31. Post-Core Capabilities - Implemented in 1.0.0

Version 1.0.0 implements the previously planned post-core capabilities. They are deliberately attached to draft validation, Tx 2 preparation, read-only preview/simulation services and post-submit reconciliation. The canonical launch still requires exactly two creator wallet approvals.

## 31.1 Per-wallet initial purchase limits

Creators may enable `maxPerWalletAtomic` for the initial curve phase. The value is positive, chain-atomic and included in the canonical Tx 2 snapshot. Participation checks use cumulative wallet purchases rather than evaluating only the current order. The chain-native curve/participation instruction is responsible for final enforcement; server eligibility checks are preflight only. A value of zero is reserved to represent the disabled state in chain configuration.

## 31.2 Configurable launch windows

Creators may define `opensAt` and `closesAt`. Both timestamps are required when the window is enabled and `closesAt` must be strictly later than `opensAt`. The UI displays the creator's local representation while the API stores ISO-8601 timestamps and chain builders convert them to the native time representation. At or after the close boundary, new initial-curve purchases are rejected.

## 31.3 Allowlist and private phases

The Launchpad does not fork eligibility logic. Restricted launches reference the existing eligibility architecture through:

```text
eligibility.mode        public | allowlist | private
eligibility.policyId    existing policy identifier
eligibility.commitment  immutable policy/root digest
```

The commitment is included in the Tx 2 review snapshot and pinned to launch state. The backend may evaluate eligibility before transaction construction, but the participation path must preserve the repository's existing chain-verifiable eligibility mechanism.

## 31.4 Venue-specific graduation preview

`GET /api/v1/launches/:id/graduation/preview` resolves the currently active governed adapter for the selected chain/venue and asks that adapter for a preview. A preview may include estimated base/quote liquidity, quote asset, pool type, tick/bin spacing, fee tier or other venue-specific parameters. Every parameter is labelled as adapter-provided, creator-provided or derived.

Preview values are estimates, not guarantees. Missing data is returned as unavailable and is never synthesized. The preview response includes adapter ID/version, assumptions, warnings and observation time.

## 31.5 Creator-configurable vesting templates

Two schedule families are supported:

**Linear** - cliff + duration, with progressive vested amount after the cliff.

**Progressive** - ordered unlock tranches expressed as offsets and incremental basis points totaling exactly 10,000.

Templates may be saved for reuse, but the concrete schedule selected for a launch is committed inside Tx 2. On Sui, the implementation provides separate linear and progressive VestingLock objects with partial claim functions. Solana instruction planning serializes the chosen schedule for the canonical vesting program/account implementation.

## 31.6 Cross-chain launch analytics

`GET /api/v1/launches/analytics` provides a normalized model across Solana and Sui:

- quote volume represented as a decimal string from atomic units;
- optional USD volume in integer micro-dollars when a validated quote/USD input exists;
- holder count;
- curve progress in basis points, clamped at 10,000;
- source and observed-at timestamp.

No floating-point token arithmetic is used for canonical normalization. If an external price is unavailable, USD volume is omitted rather than estimated.

## 31.7 Tx 2 simulation

`POST /api/v1/launches/:id/configure/simulate` is available only after Tx 1 has been verified. The service resolves the approved graduation adapter, computes the same canonical configuration hash used by prepare, and returns expected effects plus chain-simulation output when the adapter supports it.

Expected effects include graduation venue/adapter, payout count, launch fee, access controls, eligibility policy, dev-buy routing and vesting. A failed chain simulation blocks Tx 2 signing. Non-fatal warnings remain visible in the Creator Console.

## 31.8 Governance-controlled graduation adapter registry

New launches may use only registry entries with `status=active`. Each entry pins:

```text
chain
venue
adapterId
version
registryEntryAddress (optional chain reference)
configHash
governanceProposalId
approvedAt
```

Only one adapter is active per chain/venue for new preparation. Governance may disable or deprecate a version for future launches. Existing launches retain their pinned adapter/version so historical configuration is reproducible; emergency execution policy may separately block a compromised adapter without silently changing the stored venue.

## 31.9 Signed configuration snapshots and review hashes

Before Tx 2 preparation the backend canonicalizes every transaction-relevant launch field, including token identity, curve, payouts, venue, adapter version, access controls, eligibility commitment, anti-bot policy, dev-buy and vesting. Operational fields such as timestamps/status are excluded.

```text
canonical JSON
    |
    v
SHA-256 configuration hash
    |
    +--> Ed25519 server signature + key ID
    |
    +--> persisted review snapshot
    |
    v
Tx 2 embeds hash
    |
 creator signs
    |
    v
RPC verification recovers hash
    |
    +-- equal --> LIVE
    +-- mismatch/missing --> reject confirmation
```

The signature proves which PowerChain review key attested the snapshot; the hash proves parameter equality. The wallet signature remains the creator's authorization. These mechanisms are complementary and do not create another wallet approval.

## 31.10 Indexer/webhook-assisted reconciliation

Provider webhooks are verified, deduplicated and recorded in `launch_reconciliation_events`. A valid event may call the normal confirmation service earlier than the periodic reconciliation worker would. It cannot directly update lifecycle state. The confirmation service always performs the chain adapter's RPC/on-chain verification and, for Tx 2, verifies the review hash.

If the provider is unavailable, delayed or produces an invalid event, scheduled RPC reconciliation remains the fallback. This preserves the source-of-truth boundary while reducing time-to-confirmation under normal conditions.

## 31.11 Two-signature invariant after 1.0.0

```text
Draft controls / eligibility / preview / simulation
                      |
                      v
Tx 1 - creator wallet approval
  deploy token primitive
                      |
              RPC verification
                      |
                      v
Governed adapter resolve + signed review snapshot
                      |
              Tx 2 simulation/review
                      |
                      v
Tx 2 - creator wallet approval
  configure launch + optional dev-buy/vesting
                      |
    RPC verification + review-hash match
                      |
                      v
                    LIVE
```

No preview, simulation, eligibility action, analytics query, registry lookup, snapshot signature or webhook callback is a creator wallet authorization. The invariant remains exactly two creator signing stages.

# 32. Glossary

| Term | Definition |
| --- | --- |
| Atomic | All operations in the transaction succeed together or none of them persist. |
| Bonding curve | Programmatic price/liquidity model used before graduation. |
| Creator | Wallet authority initiating and approving a token launch. |
| Dev-buy | Optional creator purchase executed during launch configuration. |
| Graduation | Migration from the PowerChain curve to the selected external liquidity venue. |
| Graduation venue | Immutable chain-specific DEX/market destination selected before Tx 2. |
| Graduation adapter | Governance-approved versioned integration used to create the destination venue/pool. |
| Eligibility commitment | Immutable digest/root binding a launch to its allowlist/private policy. |
| Review hash | SHA-256 digest of the canonical Tx 2 configuration reviewed by the creator. |
| Review snapshot | Canonical Tx 2 configuration plus hash, Ed25519 signature, key ID and creation time. |
| MIST | Atomic SUI denomination; 1 SUI = 1,000,000,000 MIST. |
| PDA | Solana Program Derived Address. |
| PTB | Sui Programmable Transaction Block. |
| Token-2022 | Solana SPL token program supporting extensions such as metadata pointer and transfer features. |
| TreasuryCap | Sui capability controlling coin minting/burning for a currency type. |
| VestingLock | On-chain object/account that restricts dev-buy token availability by schedule. |

# Appendix A. Canonical Chain Matrix

| Property | Solana | Sui |
| --- | --- | --- |
| Chain key | solana | sui |
| Token deployment | Token-2022 mint creation | Move package publication |
| Tx 1 artifact | Mint address + signature | Package ID + coin type + digest |
| Tx 2 artifact | Launch PDA/config + signature | Launch object + digest |
| Launch fee | Deployment policy; no fixed value in this spec | 2 SUI |
| Anti-bot units | Normalized seconds -> program representation | Seconds -> milliseconds |
| Dev-buy execution | Same Solana transaction | Same PTB |
| Vesting | Vesting PDA/account | VestingLock<T> object |
| Venue set | Raydium / Meteora / Orca | Cetus / DeepBook / Turbos |
| Venue mutability | No after Tx 2 | No after Tx 2 |
| Access controls | Wallet cap + time window + eligibility commitment in launch config | Wallet cap + time window + eligibility commitment in Launch<T> |
| Adapter pinning | Governance registry entry + adapter version in Tx 2 data | Adapter ID/version/config hash in Launch<T> |
| Review integrity | SHA-256 review hash embedded in Tx 2 / launch state | 32-byte SHA-256 review hash stored in Launch<T> |
| Confirmation source | RPC account + transaction verification + review-hash match | Transaction effects + object verification + review-hash match |

# Appendix B. Security Invariants Checklist

- Backend prepares transactions but never signs creator transactions.
- Private keys, seed phrases and recovery phrases are never requested or persisted.
- Tx 1 and Tx 2 are separately reviewed and authorized.
- Payout basis points equal 10,000 exactly.
- Sui launch fee equals 2 SUI exactly.
- Graduation venue belongs to the selected chain.
- Graduation venue is immutable after Tx 2 verification.
- Vested dev-buy never passes through an unlocked intermediate creator balance.
- Token deployment confirmation verifies the deployed primitive, not only transaction success.
- Launch configuration confirmation verifies creator, token, curve, payouts, delay, venue and vesting effects.
- No arbitrary Move source is compiled from creator input.
- External venue IDs are environment-configured and validated.
- New launches resolve only an active governance-approved graduation adapter/version.
- Restricted launches bind an existing eligibility policy to an immutable commitment.
- Per-wallet caps and launch windows are committed as Tx 2 parameters when enabled.
- Progressive vesting tranches are ordered and sum to 10,000 bps.
- Tx 2 configuration is canonicalized and hashed with SHA-256 before wallet review.
- Review hashes are signed with a server-controlled Ed25519 key and stored with key ID.
- Tx 2 confirmation rejects missing or mismatched recovered review hashes.
- Webhook/indexer events are authenticated/deduplicated but never treated as final verification.
- RPC/on-chain verification remains the fallback and authoritative reconciliation path.
- Database persistence cannot override on-chain truth.
- Recovery and reconciliation are idempotent.


---

# 33. Production Checkout Hardening

PowerChain Launchpad 1.0.0 adds a production-safety layer around the deployed PowerPay checkout without changing the two-signature launch lifecycle.

## 33.1 Runtime readiness

Live transfers are not controlled by a client feature flag. The backend derives readiness from deployment mode and required chain configuration. A production action remains blocked unless all required values are present and non-placeholder.

Runtime modes:

```text
READ_ONLY
SIMULATION
LIVE
MAINTENANCE
```

For Solana, the production gate includes the RPC endpoint, canonical PWRC mint, treasury recipient, Launchpad program and review-signing configuration. For Sui, it includes the RPC endpoint, Launchpad package, fee vault and review-signing configuration. Chain SDK validation of deployed addresses remains a repository integration requirement.

## 33.2 Quote commitment

The server-authoritative quote hash now commits to all execution-relevant values:

```text
quote id
chain + network
wallet
payment asset + payment amount
receive mint/type + receive amount
treasury recipient
service fee
nonce
issued timestamp
expiry timestamp
```

Any wallet, network, amount, treasury, fee or expiry change invalidates the quote. The client never supplies the authoritative receive amount, fee, treasury or quote hash.

## 33.3 Settlement ambiguity

A submitted transaction may time out before RPC can prove success or failure. 1.0.0 introduces an explicit state:

```text
EXECUTION_UNKNOWN
```

This state prevents dangerous automatic retry behavior. While unknown:

- no PWRC allocation is credited;
- no replacement payment is automatically submitted;
- webhook/indexer hints cannot settle the order;
- reconciliation re-queries canonical RPC/on-chain state;
- the order resolves only to `SETTLED` or `FAILED`.

## 33.4 Solana freshness

Prepared Solana transactions include `blockhash` and `lastValidBlockHeight`. Before wallet review/signing, the client or transaction orchestration layer checks current block height. An expired transaction is rebuilt rather than signed or broadcast.

## 33.5 D1 checkout evidence

Checkout quote/order persistence remains in D1. 1.0.0 adds durable quote commitments and settlement evidence while launch configuration remains in the existing launch repository. This avoids accidental dual authority between checkout persistence and the launch-state database.

## 33.6 User-facing trust state

The checkout surface should show:

- runtime readiness and why execution is blocked;
- connected wallet/network mismatch;
- quote hash and expiry;
- server-authoritative payment terms;
- submission/confirmation/reconciliation state;
- explicit `EXECUTION_UNKNOWN` messaging when outcome is not yet provable.

A disabled action without an explanation is not sufficient for a financial transaction flow.

## 33.7 Acceptance criteria

Production activation requires all of the following:

1. Live mode cannot be enabled by the browser alone.
2. Missing PWRC mint or treasury keeps Solana transfers blocked.
3. Quote replay from another wallet is rejected.
4. Chain or network mismatch is rejected before signing.
5. Expired Solana blockhash causes transaction rebuild.
6. RPC timeout after submission produces `EXECUTION_UNKNOWN`, not automatic failure.
7. Unknown transactions are never automatically retried.
8. Token allocation occurs only after verified settlement.
9. D1 enforces unique quote hash and transaction ID evidence.
10. The launch state machine still requires exactly Tx 1 + Tx 2 creator signatures.


# 36. Production Reliability Extensions — 1.0.0

## 36.1 Checkout transaction intent

Every wallet-submitted checkout transaction MUST be validated against a persisted server-authoritative transaction intent. The intent binds the order ID, quote ID/hash, chain, network, signing wallet, exact transfer recipients, assets and atomic amounts, service-fee commitment, issue time and expiry. A valid chain signature alone is insufficient for settlement.

The canonical flow is:

```text
SERVER QUOTE
   ↓
BOUND QUOTE HASH
   ↓
TRANSACTION INTENT
   ↓
SHA-256 INTENT HASH
   ↓
PERSIST INTENT
   ↓
BUILD / REVIEW WALLET TRANSACTION
   ↓
PARSE SIGNED TRANSACTION
   ↓
VERIFY EFFECTS == INTENT
   ↓
SUBMIT
```

Any recipient, amount, asset, wallet, network or quote-commitment mismatch MUST fail closed before the transaction can be treated as a valid PowerChain checkout execution.

## 36.2 RPC quorum reconciliation

Where multiple RPC providers are configured, settlement verification SHOULD use quorum semantics. A single provider must not override contradictory evidence. Conflicting observations produce `EXECUTION_UNKNOWN`; they never produce `SETTLED`.

`ABSENT` is accepted only when every configured verifier reports the transaction absent according to the verifier's finality/retention policy.

## 36.3 Pending transaction recovery

Expired or rejected unsigned launch transactions MAY be rebuilt while the launch remains in `TOKEN_DEPLOY_PENDING` or `LAUNCH_CONFIG_PENDING`. Rebuilding is not a lifecycle transition. It does not create Tx 3.

For Tx 2 recovery, the implementation MUST reuse the original:

- configuration review hash;
- signed review snapshot;
- governed graduation adapter and version;
- graduation venue;
- payout policy;
- launch-window / limit / eligibility commitments; and
- vesting configuration.

If any of those values need to change, the pending launch configuration must not be silently rebuilt under the old review commitment.

## 36.4 Append-only audit evidence

Security-sensitive launch, checkout and governance commands SHOULD produce append-only audit records. Each record hashes its canonical payload together with the preceding record hash, creating a tamper-evident chain suitable for incident review and exportable audit evidence.

Audit evidence does not replace blockchain verification; it records the platform's policy and execution decisions around that verification.

## 36.5 Persistence boundary

PowerPay checkout state remains authoritative in D1. Token-launch lifecycle and governance state remain authoritative in Prisma/PostgreSQL. The two stores MUST coordinate through durable IDs, events and reconciliation rather than pretending to share an atomic distributed transaction.

## 36.6 Additional release gates

A production release MUST verify all of the following:

1. transaction-intent mismatches are rejected before settlement;
2. configured RPC disagreement produces `EXECUTION_UNKNOWN`;
3. all-provider absence may resolve unknown execution to `FAILED`;
4. reconciliation retries are idempotent and counted;
5. pending Tx 2 recovery preserves the existing review hash;
6. audit-record mutation/reordering is detectable; and
7. the original two creator wallet signatures remain the only launch signature stages.
