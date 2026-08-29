export type AppErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "RPC_ERROR"
  | "CHAIN_VERIFICATION_FAILED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    message: string,
    status = 500,
    options: { retryable?: boolean; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.retryable = options.retryable ?? false;
    if (options.details) this.details = options.details;
  }
}

export interface ApiSuccess<T> {
  data: T;
  requestId: string;
}

export interface ApiFailure {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  requestId: string;
}

export type SolanaNetwork = "mainnet-beta" | "devnet" | "testnet" | "localnet";

export function solanaExplorerTx(signature: string, network: SolanaNetwork): string {
  const base = `https://solscan.io/tx/${encodeURIComponent(signature)}`;
  if (network === "mainnet-beta") return base;
  if (network === "localnet") return base;
  return `${base}?cluster=${encodeURIComponent(network)}`;
}

export function suiExplorerTx(digest: string, network: "mainnet" | "testnet" | "devnet" | "localnet"): string {
  const net = network === "localnet" ? "devnet" : network;
  return `https://suiscan.xyz/${net}/tx/${encodeURIComponent(digest)}`;
}

export * from "./constants/networks";
export * from "./utils/epoch";
export * from "./utils/explorer";
export * from "./utils/rpc";
