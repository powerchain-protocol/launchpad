"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Program = {
  kind: string;
  name: string;
  address: string | null;
  configured: boolean;
  required: boolean;
  exists: boolean;
  executable: boolean;
  executableRequired: boolean;
  placeholder: boolean;
  error?: string;
};
type Mint = {
  mint: string;
  tokenProgram: string;
  decimals: number | null;
  supplyUi: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  extensionTypes: string[];
  powerPay: { status: string; configuredAsPwrc: boolean; configuredAsUsdc: boolean; reasons: string[] };
  metadata: { name: string | null; symbol: string | null; uri: string | null } | null;
  explorerUrl: string;
};
type Market = {
  mint: string;
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceChange24hPercent: number | null;
  holderCount: number | null;
  priceConfidencePercent: number | null;
  priceAgeSeconds: number | null;
  priceStale: boolean | null;
  sources: string[];
};
type Overview = {
  product: "PowerPay";
  network: string;
  mode: string;
  rpc: {
    status: "ok" | "degraded" | "error";
    healthyProviders: number;
    providerCount: number;
    slot: number | null;
    blockHeight: number | null;
    coreVersion: string | null;
    latestBlockhash: string | null;
    lastValidBlockHeight: number | null;
    genesisHash: string | null;
  };
  programs: { configured: boolean; verified: boolean; programs: Program[] };
  checkout: {
    solEnabled: boolean;
    usdcEnabled: boolean;
    pwrcReceiveConfigured: boolean;
    treasury: string | null;
    serviceFeeRecipient: string | null;
    serviceFeeBps: number;
  };
  mint: Mint | null;
  market: Market | null;
};
type Creator = {
  wallet: string;
  sol: string;
  tokenAccountCount: number;
  powerPay: {
    pwrcBalanceUi: string | null;
    usdcBalanceUi: string | null;
    isTreasury: boolean;
    isServiceFeeRecipient: boolean;
  };
  explorerUrl: string;
};

function money(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value < 1 ? 8 : 2 }).format(value);
}

function short(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function PowerPayClient() {
  const [overview, setOverview] = useState<Overview>();
  const [creator, setCreator] = useState<Creator>();
  const [mint, setMint] = useState<Mint>();
  const [creatorAddress, setCreatorAddress] = useState("");
  const [mintAddress, setMintAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const next = await api<Overview>("/api/v1/powerpay/overview");
      setOverview(next);
      if (next.mint && !mintAddress) setMintAddress(next.mint.mint);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load PowerPay state.");
    } finally { setBusy(false); }
  }, [mintAddress]);

  useEffect(() => { void refresh(); }, [refresh]);

  const inspectCreator = async () => {
    if (!creatorAddress.trim()) return;
    setBusy(true); setError("");
    try { setCreator(await api<Creator>(`/api/v1/creator/${encodeURIComponent(creatorAddress.trim())}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to inspect creator wallet."); }
    finally { setBusy(false); }
  };

  const inspectMint = async () => {
    if (!mintAddress.trim()) return;
    setBusy(true); setError("");
    try { setMint(await api<Mint>(`/api/v1/token/mint/${encodeURIComponent(mintAddress.trim())}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to inspect mint."); }
    finally { setBusy(false); }
  };

  return <div className="stack" aria-busy={busy}>
    <section className="card stack">
      <div className="label">PowerPay · Operations</div>
      <div className="grid two">
        <div><h1>RPC, programs & market</h1><p className="muted">Server-side diagnostics for the configured Solana cluster and PowerPay rails. Provider URLs and API credentials are never returned to the browser.</p></div>
        <button className="button secondary" type="button" onClick={() => void refresh()} disabled={busy}>{busy ? "Refreshing…" : "Refresh state"}</button>
      </div>
      {error ? <p role="alert" className="danger">{error}</p> : null}
    </section>

    <div className="grid two">
      <section className="card stack">
        <div className="label">RPC / cluster</div>
        <h2>{overview?.rpc.status ?? "Loading"}</h2>
        <p className="muted">{overview ? `${overview.rpc.healthyProviders}/${overview.rpc.providerCount} RPC providers healthy · ${overview.network} · ${overview.mode}` : "Reading server-side RPC health…"}</p>
        <dl className="stack">
          <div><dt className="muted">Slot / block height</dt><dd>{overview?.rpc.slot ?? "—"} / {overview?.rpc.blockHeight ?? "—"}</dd></div>
          <div><dt className="muted">Solana core</dt><dd>{overview?.rpc.coreVersion ?? "—"}</dd></div>
          <div><dt className="muted">Blockhash</dt><dd className="mono">{short(overview?.rpc.latestBlockhash)}</dd></div>
          <div><dt className="muted">Last valid block height</dt><dd>{overview?.rpc.lastValidBlockHeight ?? "—"}</dd></div>
          <div><dt className="muted">Genesis hash</dt><dd className="mono">{short(overview?.rpc.genesisHash)}</dd></div>
        </dl>
      </section>

      <section className="card stack">
        <div className="label">Payment rails</div>
        <h2>PowerPay readiness</h2>
        <p className="muted">SOL {overview?.checkout.solEnabled ? "ready" : "not ready"} · USDC {overview?.checkout.usdcEnabled ? "ready" : "not ready"} · PWRC receive mint {overview?.checkout.pwrcReceiveConfigured ? "configured" : "missing"}</p>
        <dl className="stack">
          <div><dt className="muted">Treasury</dt><dd className="mono">{short(overview?.checkout.treasury)}</dd></div>
          <div><dt className="muted">Fee recipient</dt><dd className="mono">{short(overview?.checkout.serviceFeeRecipient)}</dd></div>
          <div><dt className="muted">Configured checkout fee</dt><dd>{overview ? `${overview.checkout.serviceFeeBps} bps` : "—"}</dd></div>
        </dl>
      </section>
    </div>

    <section className="card stack">
      <div className="label">Programs</div>
      <h2>PowerPay deployment verification</h2>
      <div className="stack">
        {overview?.programs.programs.map((program) => <div key={program.kind} className="status">
          <strong>{program.name}</strong>
          <span className="muted">{program.configured ? (program.exists && (!program.executableRequired || program.executable) && !program.placeholder ? "verified" : "configured / not verified") : "not configured"}</span>
          <span className="mono">{short(program.address)}</span>
          {program.error ? <span className="danger">{program.error}</span> : null}
        </div>)}
      </div>
    </section>

    <div className="grid two">
      <section className="card stack">
        <div className="label">PWRC market</div>
        <h2>{overview?.mint?.metadata?.symbol ?? "Configured mint"}</h2>
        <div className="grid two">
          <div><div className="muted">Price</div><strong>{money(overview?.market?.priceUsd ?? null)}</strong></div>
          <div><div className="muted">Market cap</div><strong>{money(overview?.market?.marketCapUsd ?? null)}</strong></div>
          <div><div className="muted">Liquidity</div><strong>{money(overview?.market?.liquidityUsd ?? null)}</strong></div>
          <div><div className="muted">24h volume</div><strong>{money(overview?.market?.volume24hUsd ?? null)}</strong></div>
        </div>
        <p className="muted">Sources: {overview?.market?.sources.length ? overview.market.sources.join(" + ") : "RPC only"}{overview?.market?.priceStale ? " · price stale" : ""}</p>
      </section>

      <section className="card stack">
        <div className="label">Mint</div>
        <h2>{overview?.mint?.tokenProgram ?? "—"}</h2>
        <p className="mono">{short(overview?.mint?.mint)}</p>
        <p className="muted">Supply {overview?.mint?.supplyUi ?? "—"} · decimals {overview?.mint?.decimals ?? "—"} · PowerPay compatibility {overview?.mint?.powerPay.status ?? "—"}</p>
        <p className="muted">Extensions: {overview?.mint?.extensionTypes.length ? overview.mint.extensionTypes.join(", ") : "none reported"}</p>
      </section>
    </div>

    <div className="grid two">
      <section className="card stack">
        <div><div className="label">Creator</div><h2>Inspect wallet</h2></div>
        <label className="field"><span>Creator wallet</span><input value={creatorAddress} onChange={(event) => setCreatorAddress(event.target.value)} placeholder="Solana wallet address" /></label>
        <button className="button secondary" type="button" onClick={() => void inspectCreator()} disabled={busy || !creatorAddress.trim()}>Inspect creator</button>
        {creator ? <div className="stack"><p><strong>{creator.sol} SOL</strong> · {creator.tokenAccountCount} token accounts</p><p className="muted">PWRC {creator.powerPay.pwrcBalanceUi ?? "—"} · USDC {creator.powerPay.usdcBalanceUi ?? "—"}{creator.powerPay.isTreasury ? " · treasury" : ""}{creator.powerPay.isServiceFeeRecipient ? " · fee recipient" : ""}</p></div> : null}
      </section>

      <section className="card stack">
        <div><div className="label">Mint inspector</div><h2>SPL / Token-2022</h2></div>
        <label className="field"><span>Mint address</span><input value={mintAddress} onChange={(event) => setMintAddress(event.target.value)} placeholder="Token mint" /></label>
        <button className="button secondary" type="button" onClick={() => void inspectMint()} disabled={busy || !mintAddress.trim()}>Inspect mint</button>
        {mint ? <div className="stack"><p><strong>{mint.metadata?.symbol ?? short(mint.mint)}</strong> · {mint.tokenProgram} · {mint.powerPay.status}</p><p className="muted">Mint authority {short(mint.mintAuthority)} · freeze authority {short(mint.freezeAuthority)}</p><p className="muted">{mint.powerPay.reasons.join(" ") || "No extension-specific PowerPay warnings."}</p></div> : null}
      </section>
    </div>
  </div>;
}
