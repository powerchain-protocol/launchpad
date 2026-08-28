const env = (name: string) => process.env[name]?.trim() || "";

export const config = {
  appUrl: env("NEXT_PUBLIC_APP_URL") || "http://localhost:3000",
  cluster: env("NEXT_PUBLIC_SOLANA_CLUSTER") || "devnet",
  rpcUrl: env("NEXT_PUBLIC_SOLANA_RPC_URL") || "https://api.devnet.solana.com",
  pwrcMint: env("NEXT_PUBLIC_PWRC_MINT"),
  usdcMint: env("NEXT_PUBLIC_USDC_MINT"),
  tokenSaleProgramId: env("NEXT_PUBLIC_TOKENSALE_PROGRAM_ID"),
  factoryProgramId: env("NEXT_PUBLIC_FACTORY_PROGRAM_ID"),
  claimProgramId: env("NEXT_PUBLIC_CLAIM_PROGRAM_ID"),
  serviceFeeBps: Number(env("POWERCHAIN_FEE_BPS") || "200"),
  feeTreasury: env("POWERCHAIN_FEE_TREASURY"),
  pwrcWithdrawAuthority: env("PWRC_WITHDRAW_WITHHELD_AUTHORITY"),
  merchantWallet: env("MERCHANT_WALLET"),
  saleAuthority: env("SALE_AUTHORITY"),
  adminWallets: env("POWERCHAIN_ADMIN_WALLETS").split(",").map((x) => x.trim()).filter(Boolean),
  poolAdapters: {
    RAYDIUM_CPMM: env("RAYDIUM_CPMM_ADAPTER_VERSION"),
    METEORA_DAMM_V2: env("METEORA_DAMM_V2_ADAPTER_VERSION"),
    ORCA_WHIRLPOOL: env("ORCA_WHIRLPOOL_ADAPTER_VERSION"),
  },
} as const;

export function solscanUrl(signature: string) {
  const c = env("NEXT_PUBLIC_SOLSCAN_CLUSTER") || config.cluster;
  return `https://solscan.io/tx/${encodeURIComponent(signature)}${c === "mainnet-beta" ? "" : `?cluster=${encodeURIComponent(c)}`}`;
}

export function solscanAccountUrl(address: string) {
  const c = env("NEXT_PUBLIC_SOLSCAN_CLUSTER") || config.cluster;
  return `https://solscan.io/account/${encodeURIComponent(address)}${c === "mainnet-beta" ? "" : `?cluster=${encodeURIComponent(c)}`}`;
}
