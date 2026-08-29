import type { SolanaNetwork } from "../index";

export function solanaExplorerAddress(address: string, network: SolanaNetwork): string {
  const base = `https://solscan.io/account/${encodeURIComponent(address)}`;
  return network === "mainnet-beta" || network === "localnet" ? base : `${base}?cluster=${encodeURIComponent(network)}`;
}

export function suiExplorerObject(objectId: string, network: "mainnet" | "testnet" | "devnet" | "localnet"): string {
  const resolved = network === "localnet" ? "devnet" : network;
  return `https://suiscan.xyz/${resolved}/object/${encodeURIComponent(objectId)}`;
}
