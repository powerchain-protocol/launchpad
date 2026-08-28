"use client";
import bs58 from "bs58";
import { Connection, Transaction } from "@solana/web3.js";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type WalletCtx = {
  address: string | null;
  providerName: string | null;
  connect: () => Promise<string>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<string>;
  signAndSend: (transaction: Transaction) => Promise<string>;
};

const WalletContext = createContext<WalletCtx | null>(null);

function discoverProvider() {
  const win = window as any;
  const candidates = [
    ["Phantom", win.phantom?.solana],
    ["Solflare", win.solflare],
    ["Backpack", win.backpack?.solana],
    ["Solana Wallet", win.solana],
  ] as const;
  return candidates.find(([, provider]) => provider?.connect) || null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [providerName, setProviderName] = useState<string | null>(null);
  const [provider, setProvider] = useState<any | null>(null);
  const providerRef = useRef<any | null>(null);

  async function connect() {
    const found = discoverProvider();
    if (!found) throw new Error("No compatible Solana wallet detected. Install Phantom, Solflare or Backpack.");
    const [name, wallet] = found;
    const result = await wallet.connect();
    const next = result.publicKey?.toString?.() ?? wallet.publicKey?.toString?.();
    if (!next) throw new Error("Wallet connected without a public key");
    providerRef.current = wallet;
    setProvider(wallet);
    setProviderName(name);
    setAddress(next);
    return next;
  }

  async function disconnect() {
    const wallet = providerRef.current ?? provider;
    await wallet?.disconnect?.();
    providerRef.current = null;
    setAddress(null);
    setProvider(null);
    setProviderName(null);
  }

  async function signMessage(message: string) {
    const wallet = providerRef.current ?? provider;
    if (!wallet?.signMessage) throw new Error("Connected wallet does not support message signing");
    const result = await wallet.signMessage(new TextEncoder().encode(message), "utf8");
    const bytes = result?.signature ?? result;
    return bs58.encode(bytes);
  }

  async function signAndSend(transaction: Transaction) {
    const wallet = providerRef.current ?? provider;
    if (!wallet) throw new Error("Connect wallet first");
    if (wallet.signAndSendTransaction) {
      const result = await wallet.signAndSendTransaction(transaction);
      return result?.signature?.toString?.() ?? String(result?.signature ?? result);
    }
    if (!wallet.signTransaction) throw new Error("Connected wallet cannot sign transactions");
    const signed = await wallet.signTransaction(transaction);
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
    return connection.sendRawTransaction(signed.serialize());
  }

  useEffect(() => {
    if (!provider?.on) return;
    const accountChanged = (publicKey: any) => setAddress(publicKey?.toString?.() ?? null);
    provider.on("accountChanged", accountChanged);
    return () => provider?.removeListener?.("accountChanged", accountChanged);
  }, [provider]);

  const value = useMemo(() => ({ address, providerName, connect, disconnect, signMessage, signAndSend }), [address, providerName, provider]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("WalletProvider missing");
  return value;
}
