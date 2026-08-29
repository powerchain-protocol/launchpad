import type {
  SolanaAssetResponse,
  SolanaMarketResponse,
  SolanaProgramStatus,
  SolanaRpcHealthResponse,
} from "../solana/types";

export interface PowerPayProgramsResponse {
  chain: "solana";
  network: SolanaRpcHealthResponse["network"];
  configured: boolean;
  verified: boolean;
  programs: SolanaProgramStatus[];
  observedAt: string;
}

export interface PowerPayOverviewResponse {
  product: "PowerPay";
  chain: "solana";
  network: SolanaRpcHealthResponse["network"];
  mode: "READ_ONLY" | "SIMULATION" | "LIVE" | "MAINTENANCE";
  rpc: SolanaRpcHealthResponse;
  programs: PowerPayProgramsResponse;
  checkout: {
    solEnabled: boolean;
    usdcEnabled: boolean;
    pwrcReceiveConfigured: boolean;
    treasury: string | null;
    serviceFeeRecipient: string | null;
    serviceFeeBps: number;
  };
  mint: SolanaAssetResponse | null;
  market: SolanaMarketResponse | null;
  observedAt: string;
}
