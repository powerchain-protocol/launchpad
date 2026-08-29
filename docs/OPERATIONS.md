# PowerChain Launchpad 1.0.0 — Operations

## Operating modes

`READ_ONLY`, `SIMULATION`, `LIVE`, and `MAINTENANCE` are explicit runtime modes. LIVE execution is fail-closed until production configuration, pricing, RPC verification, launch adapters, review signing, and persistence are installed.

## Daily checks

1. Confirm `/api/v1/runtime/readiness` has no required blockers.
2. Verify Solana RPC quorum health and Sui gRPC health.
3. Confirm pricing freshness and source identity.
4. Review `EXECUTION_UNKNOWN` and `REJECTED` checkout orders.
5. Review pending `TOKEN_DEPLOY_PENDING` and `LAUNCH_CONFIG_PENDING` launches for expired unsigned transactions.
6. Confirm realtime health; realtime is advisory and polling/RPC verification remains authoritative.
7. Review webhook deduplication and RPC observation evidence.

## Reconciliation

Never mark a checkout settled from a client callback or websocket event. Settlement must pass the chain verifier against the persisted transaction intent. `EXECUTION_UNKNOWN` must remain unresolved until RPC quorum reaches a deterministic result.

## Launch recovery

Expired unsigned Tx 1 or Tx 2 payloads may be rebuilt without adding a lifecycle stage. Tx 2 rebuilds must reuse the persisted review hash and governed graduation adapter/version.

## Key rotation

Review-signing keys and realtime HMAC secrets must be rotated through environment/configuration management. Existing signed review snapshots retain their key ID for audit verification.

## Incident mode

Switch to `MAINTENANCE` or `READ_ONLY` before changing RPC providers, pricing providers, treasury configuration, program IDs, package IDs, or governance registries. A read-RPC preference never changes settlement authority.
