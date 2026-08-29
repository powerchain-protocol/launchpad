"use client";

import { Transaction } from "@solana/web3.js";

export type SolanaWalletName = "Phantom" | "Solflare" | "Backpack";

interface InjectedSolanaProvider {
  isConnected?: boolean;
  publicKey?: { toBase58(): string };
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey?: { toBase58(): string } } | void>;
  disconnect?(): Promise<void>;
  signAndSendTransaction(transaction: Transaction): Promise<{ signature: string } | string>;
}

declare global {
  interface Window {
    phantom?: { solana?: InjectedSolanaProvider };
    solflare?: InjectedSolanaProvider;
    backpack?: InjectedSolanaProvider;
    solana?: InjectedSolanaProvider;
  }
}

function providerFor(name: SolanaWalletName): InjectedSolanaProvider {
  if (typeof window === "undefined") throw new Error("Solana wallet access is browser-only.");
  const provider = name === "Phantom"
    ? (window.phantom?.solana ?? window.solana)
    : name === "Solflare"
      ? window.solflare
      : window.backpack;
  if (!provider) throw new Error(`${name} wallet extension was not detected.`);
  return provider;
}

export async function connectSolanaWallet(name: SolanaWalletName): Promise<string> {
  const provider = providerFor(name);
  const result = await provider.connect();
  const publicKey = result && "publicKey" in result ? result.publicKey : provider.publicKey;
  const address = publicKey?.toBase58();
  if (!address) throw new Error(`${name} did not return a wallet address.`);
  return address;
}

export async function signAndSendSerializedSolanaTransaction(
  name: SolanaWalletName,
  transactionBase64: string,
): Promise<string> {
  const provider = providerFor(name);
  const binary = atob(transactionBase64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const transaction = Transaction.from(bytes);
  const result = await provider.signAndSendTransaction(transaction);
  const signature = typeof result === "string" ? result : result.signature;
  if (!signature) throw new Error(`${name} returned no transaction signature.`);
  return signature;
}
