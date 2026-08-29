"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RuntimeReadinessReport, SettlementEvidence } from "@powerchain/launchpad-domain/checkout";
import { solanaExplorerTx } from "@powerchain/launchpad-shared";
import { api } from "@/lib/api";
import {
  connectSolanaWallet,
  signAndSendSerializedSolanaTransaction,
  type SolanaWalletName,
} from "@/lib/wallet/solana";
import { SettlementTimeline } from "@/components/checkout/settlement-timeline";
import { useOrderRealtime, type OrderRealtimeSession } from "@/hooks/use-order-realtime";

type Quote = {
  quoteId: string;
  quoteHash: string;
  paymentAmountAtomic: string;
  receiveAmountAtomic: string;
  expiresAt: string;
  priceSource?: string;
};
type Prepared = {
  orderId: string;
  transactionBase64: string;
  lastValidBlockHeight: number;
  quoteHash: string;
  intentHash: string;
  realtime?: OrderRealtimeSession;
};
type OrderView = { evidence: SettlementEvidence; receipt?: { id: string; transactionId: string; createdAt: string } };

export function CheckoutClient() {
  const [walletName, setWalletName] = useState<SolanaWalletName>("Phantom");
  const [wallet, setWallet] = useState("");
  const [amount, setAmount] = useState("0.1");
  const [asset, setAsset] = useState<"SOL" | "USDC">("SOL");
  const [quote, setQuote] = useState<Quote>();
  const [prepared, setPrepared] = useState<Prepared>();
  const [signature, setSignature] = useState("");
  const [status, setStatus] = useState("idle");
  const [orderView, setOrderView] = useState<OrderView>();
  const [readiness, setReadiness] = useState<RuntimeReadinessReport>();
  const [error, setError] = useState("");

  useEffect(() => {
    void api<RuntimeReadinessReport>("/api/v1/runtime/readiness")
      .then(setReadiness)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Readiness unavailable"));
  }, []);

  const solanaRuntime = useMemo(
    () => readiness?.chains.find((entry) => entry.chain === "solana"),
    [readiness],
  );
  const network = solanaRuntime?.network === "mainnet-beta" ? "mainnet-beta" : "devnet";
  const live = Boolean(readiness?.mode === "LIVE" && solanaRuntime?.transferEnabled);

  const connect = async () => {
    setError("");
    try {
      setWallet(await connectSolanaWallet(walletName));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wallet connection failed");
    }
  };

  const getQuote = async () => {
    if (!wallet) return setError("Connect a wallet first.");
    setStatus("quoting");
    setError("");
    try {
      const next = await api<Quote>("/api/v1/checkout/quotes", {
        method: "POST",
        body: JSON.stringify({ chain: "solana", network, wallet, paymentAsset: asset, paymentAmount: amount }),
      });
      setQuote(next);
      setPrepared(undefined);
      setSignature("");
      setOrderView(undefined);
      setStatus("quoted");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Quote failed");
      setStatus("error");
    }
  };

  const prepare = async () => {
    if (!quote) return;
    setStatus("preparing");
    setError("");
    try {
      const next = await api<Prepared>("/api/v1/checkout/orders", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ quoteId: quote.quoteId, quoteHash: quote.quoteHash, wallet }),
      });
      setPrepared(next);
      setStatus("awaiting_signature");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Preparation failed");
      setStatus("error");
    }
  };

  const refresh = useCallback(async () => {
    if (!prepared) return;
    try {
      const view = await api<OrderView>(`/api/v1/checkout/orders/${encodeURIComponent(prepared.orderId)}`);
      setOrderView(view);
      setStatus(view.evidence.state.toLowerCase());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Order status unavailable");
    }
  }, [prepared]);

  useOrderRealtime(prepared?.realtime, () => void refresh());

  const sign = async () => {
    if (!prepared) return;
    setStatus("signing");
    setError("");
    try {
      const transactionId = await signAndSendSerializedSolanaTransaction(walletName, prepared.transactionBase64);
      setSignature(transactionId);
      setStatus("submitted");
      await api(`/api/v1/checkout/orders/${encodeURIComponent(prepared.orderId)}/submit`, {
        method: "POST",
        body: JSON.stringify({ transactionId }),
      });
      setStatus("confirming");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wallet signing failed");
      setStatus("error");
    }
  };

  const reconcile = async () => {
    if (!prepared) return;
    setStatus("reconciling");
    setError("");
    try {
      const view = await api<OrderView>(
        `/api/v1/checkout/orders/${encodeURIComponent(prepared.orderId)}/reconcile`,
        { method: "POST" },
      );
      setOrderView(view);
      setStatus(view.evidence.state.toLowerCase());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reconciliation failed");
      setStatus("error");
    }
  };

  return (
    <div className="grid two">
      <section className="card stack">
        <div>
          <div className="label">PowerPay</div>
          <h1>Checkout</h1>
          <p className="muted">
            Recipients, exact atomic amounts, service fee and quote commitment are server-authoritative. The wallet only reviews and signs the serialized transaction.
          </p>
        </div>
        <div className="status">
          Runtime: {readiness?.mode ?? "checking"} · {network} · {live ? "live transfers ready" : "fail-closed"}
        </div>
        {readiness && !live && readiness.blockers.length ? (
          <ul className="muted">{readiness.blockers.slice(0, 4).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
        ) : null}
        <label className="field">
          <span>Wallet</span>
          <select value={walletName} onChange={(event) => setWalletName(event.target.value as SolanaWalletName)}>
            <option>Phantom</option><option>Solflare</option><option>Backpack</option>
          </select>
        </label>
        <button className="button secondary" onClick={() => void connect()} type="button">
          {wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet"}
        </button>
        <div className="grid two">
          <label className="field"><span>Asset</span><select value={asset} onChange={(event) => setAsset(event.target.value as "SOL" | "USDC")}><option>SOL</option><option>USDC</option></select></label>
          <label className="field"><span>Amount</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></label>
        </div>
        <button className="button" type="button" onClick={() => void getQuote()} disabled={!live}>Create server quote</button>
        {quote ? <button className="button" type="button" onClick={() => void prepare()}>Prepare transaction</button> : null}
        {prepared && !signature ? <button className="button" type="button" onClick={() => void sign()}>Review in wallet & sign</button> : null}
        {signature ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="button secondary" type="button" onClick={() => void refresh()}>Refresh status</button><button className="button" type="button" onClick={() => void reconcile()}>Verify & reconcile</button></div> : null}
        {error ? <p role="alert" style={{ color: "var(--danger)" }}>{error}</p> : null}
      </section>
      <aside className="stack">
        <section className="card stack">
          <div className="label">Transaction integrity</div>
          <h2>Review state</h2>
          <div>Status: <strong>{status}</strong></div>
          <div>Wallet: <code>{wallet || "Not connected"}</code></div>
          <div>Quote hash: <code style={{ wordBreak: "break-all" }}>{quote?.quoteHash ?? "—"}</code></div>
          <div>Intent hash: <code style={{ wordBreak: "break-all" }}>{prepared?.intentHash ?? "—"}</code></div>
          <div>Quote source: <strong>{quote?.priceSource ?? "—"}</strong></div>
          <div>Last valid block height: <strong>{prepared?.lastValidBlockHeight ?? "—"}</strong></div>
          {signature ? <a href={solanaExplorerTx(signature, network)} target="_blank" rel="noopener noreferrer">Open transaction in Solscan ↗</a> : null}
          {orderView?.receipt ? <div role="status"><strong>Receipt issued:</strong> <code>{orderView.receipt.id}</code></div> : null}
          <p className="muted">Submission is not settlement proof. PowerChain parses the chain transaction and verifies it against the persisted intent before issuing a receipt.</p>
        </section>
        {orderView ? <SettlementTimeline evidence={orderView.evidence} /> : null}
      </aside>
    </div>
  );
}
