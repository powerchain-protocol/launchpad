export const DEFAULT_REQUEST_BODY_LIMIT_BYTES = 1024 * 1024;
export const RPC_HEALTH_TIMEOUT_MS = 8_000;
export const WEBSOCKET_MESSAGE_LIMIT_BYTES = 64 * 1024;
export const WEBSOCKET_MESSAGES_PER_MINUTE = 120;
export const WEBSOCKET_MAX_SUBSCRIPTIONS = 32;

export const SOLANA_NETWORKS = ["mainnet-beta", "devnet", "testnet", "localnet"] as const;
export const SUI_NETWORKS = ["mainnet", "testnet", "devnet", "localnet"] as const;
