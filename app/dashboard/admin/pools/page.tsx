"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/components/wallet-provider";
import { signPurpose } from "@/lib/client/wallet-auth";
import type { LaunchPool, PoolMode, PoolReview, PoolVenue } from "@/types/domain";

type PoolRow = { pool: LaunchPool; review: PoolReview };
const venues: PoolVenue[] = ["RAYDIUM_CPMM", "METEORA_DAMM_V2", "ORCA_WHIRLPOOL"];

const blank = (): Partial<LaunchPool> => ({
  mode: "SALE_GRADUATION",
  saleId: "demo",
  name: "PWRC / USDC",
  baseSymbol: "PWRC",
  baseDecimals: 9,
  quoteSymbol: "USDC",
  quoteDecimals: 6,
  venue: "RAYDIUM_CPMM",
  initialBaseAmount: "0",
  initialQuoteAmount: "0",
  graduationThresholdBps: 10_000,
  validated: false,
});

export default function AdminPoolsPage() {
  const { address, connect, signMessage } = useWallet();
  const [rows, setRows] = useState<PoolRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<Partial<LaunchPool>>(blank());
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function refresh(preferId?: string) {
    const r = await fetch("/api/v1/pools", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "POOL_LOAD_FAILED");
    const next = (j.pools || []) as PoolRow[];
    setRows(next);
    if (preferId) setSelectedId(preferId);
  }

  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);
  const selected = useMemo(() => rows.find((row) => row.pool.id === selectedId) || rows[0] || null, [rows, selectedId]);
  useEffect(() => {
    if (!creating && selected) {
      setSelectedId(selected.pool.id);
      setDraft(selected.pool);
    }
  }, [selected?.pool.id, selected?.pool.updatedAt, creating]);

  async function auth(purpose: string) {
    const signer = address || await connect();
    return signPurpose({ address: signer, purpose, signMessage });
  }

  async function save() {
    try {
      setBusy(true); setError(""); setOk("");
      if (creating) {
        const authorization = await auth("admin:pools:create");
        const r = await fetch("/api/v1/pools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...authorization, pool: draft }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "POOL_CREATE_FAILED");
        setCreating(false);
        await refresh(j.pool.id);
        setOk("Pool draft created. Complete validation, save, then approve the deterministic review snapshot.");
      } else {
        if (!selected) throw new Error("POOL_NOT_SELECTED");
        const authorization = await auth(`admin:pool:${selected.pool.id}:update`);
        const r = await fetch(`/api/v1/pools/${selected.pool.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...authorization, expectedRevision: selected.pool.revision, patch: { ...draft, feeTierBps: draft.feeTierBps ?? null } }) });
        const j = await r.json();
        if (!r.ok) {
          if (r.status === 409 && String(j.error || "").includes("REVISION_CONFLICT")) {
            await refresh(selected.pool.id);
            throw new Error("POOL_CHANGED_BY_ANOTHER_OPERATOR_REFRESHED_LATEST_REVISION");
          }
          throw new Error(j.error || "POOL_UPDATE_FAILED");
        }
        await refresh(selected.pool.id);
        setOk(j.review?.reviewCurrent ? "Pool configuration saved. Approved review remains current." : "Pool configuration saved. Review approval is required before Ready.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "POOL_SAVE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function approveReview() {
    if (!selected) return;
    try {
      setBusy(true); setError(""); setOk("");
      const authorization = await auth(`admin:pool:${selected.pool.id}:review`);
      const r = await fetch(`/api/v1/pools/${selected.pool.id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...authorization, expectedRevision: selected.pool.revision }) });
      const j = await r.json();
      if (!r.ok) {
        if (r.status === 409 && String(j.error || "").includes("REVISION_CONFLICT")) {
          await refresh(selected.pool.id);
          throw new Error("POOL_CHANGED_BEFORE_REVIEW_APPROVAL_REFRESHED_LATEST_REVISION");
        }
        throw new Error(j.error || "POOL_REVIEW_FAILED");
      }
      await refresh(selected.pool.id);
      setOk("Review snapshot approved. The stored hash now matches the exact configuration and adapter version.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "POOL_REVIEW_FAILED");
    } finally {
      setBusy(false);
    }
  }

  const review = creating ? null : selected?.review || null;
  const dirty = Boolean(!creating && selected && JSON.stringify(draft) !== JSON.stringify(selected.pool));

  return <main className="shell py-10 sm:py-12">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href="/dashboard/admin" className="text-sm font-bold muted">← Authority console</Link>
        <div className="label mt-5">Launch operations</div>
        <h1 className="mt-1 text-3xl font-extrabold">Pool manager</h1>
        <p className="mt-2 max-w-2xl muted">Pool configuration and review approval are separate signed actions. Editing a reviewed parameter makes the stored snapshot stale until an authority signs a new review.</p>
      </div>
      <div className="flex gap-2"><Link href="/launch/pools" className="btn">Public pools</Link><button className="btn btn-primary" onClick={() => { setCreating(true); setDraft(blank()); setError(""); setOk(""); }}>New pool</button></div>
    </div>

    <div className="mt-6 grid gap-5 lg:grid-cols-[.72fr_1.28fr]">
      <aside className="card p-4">
        <div className="label px-2 pt-2">Registry</div>
        <div className="mt-3 grid gap-2">
          {rows.map(({ pool, review }) => <button key={pool.id} className={`pool-admin-row ${!creating && selected?.pool.id === pool.id ? "pool-admin-row-active" : ""}`} onClick={() => { setCreating(false); setSelectedId(pool.id); setDraft(pool); setError(""); setOk(""); }}>
            <span className="min-w-0 text-left"><b className="block truncate">{pool.name}</b><span className="mt-1 block text-xs muted">{pool.venue.replaceAll("_", " ")}</span></span>
            <span className={`status ${review.ready ? "status-ready" : review.configurationValid ? "status-scheduled" : "status-draft"}`}>{review.ready ? "Ready" : review.configurationValid ? "Review" : `${review.configurationBlockers.length} blocked`}</span>
          </button>)}
          {!rows.length && <p className="p-3 text-sm muted">No pool records.</p>}
        </div>
      </aside>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="label">{creating ? "New pool" : "Configuration"}</div><h2 className="mt-1 text-2xl font-extrabold">{creating ? "Create launch pool" : draft.name || "Pool"}</h2>{!creating && selected && <p className="mt-1 text-xs muted">Record revision {selected.pool.revision} · configuration revision {selected.pool.configurationRevision}</p>}</div>
          {review && <div className="flex flex-wrap gap-2"><span className={`status ${review.configurationValid ? "status-live" : "status-draft"}`}>{review.configurationValid ? "Config valid" : "Config blocked"}</span><span className={`status ${review.reviewCurrent ? "status-ready" : "status-scheduled"}`}>{review.reviewCurrent ? "Review current" : "Review required"}</span></div>}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={draft.name || ""} onChange={(v) => setDraft({ ...draft, name: v })}/>
          <label><span className="label">Venue</span><select className="input mt-2" value={draft.venue || "RAYDIUM_CPMM"} onChange={(e) => setDraft({ ...draft, venue: e.target.value as PoolVenue })}>{venues.map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></label>
          <label><span className="label">Mode</span><select className="input mt-2" value={draft.mode || "SALE_GRADUATION"} onChange={(e) => setDraft({ ...draft, mode: e.target.value as PoolMode })}><option value="SALE_GRADUATION">Sale graduation</option><option value="MANUAL">Manual</option></select></label>
          <Field label="Fee tier · bps optional" value={draft.feeTierBps === undefined ? "" : String(draft.feeTierBps)} inputMode="numeric" onChange={(v) => setDraft({ ...draft, feeTierBps: v === "" ? undefined : Number(v.replace(/\D/g, "")) })}/>
          <Field label="Base mint" value={draft.baseMint || ""} onChange={(v) => setDraft({ ...draft, baseMint: v.trim() })}/>
          <Field label="Quote mint" value={draft.quoteMint || ""} onChange={(v) => setDraft({ ...draft, quoteMint: v.trim() })}/>
          <Field label="Base symbol" value={draft.baseSymbol || ""} onChange={(v) => setDraft({ ...draft, baseSymbol: v })}/>
          <Field label="Quote symbol" value={draft.quoteSymbol || ""} onChange={(v) => setDraft({ ...draft, quoteSymbol: v })}/>
          <Field label="Base decimals" value={String(draft.baseDecimals ?? 9)} inputMode="numeric" onChange={(v) => setDraft({ ...draft, baseDecimals: Number(v.replace(/\D/g, "").slice(0, 2) || 0) })}/>
          <Field label="Quote decimals" value={String(draft.quoteDecimals ?? 6)} inputMode="numeric" onChange={(v) => setDraft({ ...draft, quoteDecimals: Number(v.replace(/\D/g, "").slice(0, 2) || 0) })}/>
          <Field label="Authority wallet" value={draft.authority || ""} onChange={(v) => setDraft({ ...draft, authority: v.trim() })}/>
          <Field label="Treasury wallet" value={draft.treasuryWallet || ""} onChange={(v) => setDraft({ ...draft, treasuryWallet: v.trim() })}/>
          <Field label="Initial base · smallest units" value={draft.initialBaseAmount || "0"} inputMode="numeric" onChange={(v) => setDraft({ ...draft, initialBaseAmount: v.replace(/\D/g, "") || "0" })}/>
          <Field label="Initial quote · smallest units" value={draft.initialQuoteAmount || "0"} inputMode="numeric" onChange={(v) => setDraft({ ...draft, initialQuoteAmount: v.replace(/\D/g, "") || "0" })}/>
          <Field label="Linked sale ID" value={draft.saleId || ""} onChange={(v) => setDraft({ ...draft, saleId: v || undefined })}/>
          <Field label="Launch at · ISO optional" value={draft.launchAt || ""} onChange={(v) => setDraft({ ...draft, launchAt: v || undefined })}/>
          <Field label="Graduation threshold · bps" value={String(draft.graduationThresholdBps ?? 10_000)} inputMode="numeric" onChange={(v) => setDraft({ ...draft, graduationThresholdBps: Number(v.replace(/\D/g, "") || 0) })}/>
          {!creating && <label><span className="label">State</span><select className="input mt-2" value={draft.status || "DRAFT"} onChange={(e) => setDraft({ ...draft, status: e.target.value as LaunchPool["status"] })}>{["DRAFT", "SCHEDULED", "READY", "FAILED"].map((s) => <option key={s}>{s}</option>)}</select></label>}
          <label className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-4 sm:self-end"><input type="checkbox" checked={Boolean(draft.validated)} onChange={(e) => setDraft({ ...draft, validated: e.target.checked })}/><span><b>Authority validated</b><span className="block text-xs muted">Confirms the off-chain configuration was checked; it does not approve the review hash.</span></span></label>
        </div>

        {dirty && <div className="notice notice-warning mt-5"><b>Unsaved changes.</b> Save configuration before approving a review snapshot.</div>}
        {review && <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="label">Deterministic review</div><span className="text-xs font-bold">{review.adapterConfigured ? `Adapter ${review.adapterVersion}` : "Adapter missing"}</span></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><Hash label="Current configuration hash" value={review.reviewHash}/><Hash label="Approved review hash" value={review.approvedReviewHash || "Not approved"}/></div>
          {review.reviewedAt && <p className="mt-3 text-xs muted">Approved {new Date(review.reviewedAt).toLocaleString()} · config revision {review.approvedConfigurationRevision ?? "—"}{review.reviewedBy ? ` · ${review.reviewedBy.slice(0, 6)}…${review.reviewedBy.slice(-4)}` : ""}</p>}
          {review.blockers.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{review.blockers.map((b) => <span className="status status-draft" key={b}>{readable(b)}</span>)}</div>}
        </div>}

        <div aria-live="polite">{ok && <div className="notice notice-success mt-5">{ok}</div>}{error && <div className="notice notice-warning mt-5 break-words">{readable(error)}</div>}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {creating && <button className="btn" disabled={busy} onClick={() => { setCreating(false); if (selected) setDraft(selected.pool); }}>Cancel</button>}
          {!creating && review?.configurationValid && !review.reviewCurrent && <button className="btn" disabled={busy || dirty} onClick={approveReview}>{busy ? "Authorizing…" : "Sign & approve review"}</button>}
          <button className="btn btn-primary" disabled={busy} aria-busy={busy} onClick={save}>{busy ? "Working…" : address ? `Sign & ${creating ? "create" : "save"}` : "Connect admin wallet"}</button>
        </div>
      </section>
    </div>
  </main>;
}

function Field({ label, value, onChange, inputMode }: { label: string; value: string; onChange: (value: string) => void; inputMode?: "numeric" | "text" }) {
  return <label className="min-w-0"><span className="label">{label}</span><input className="input mt-2" value={value} inputMode={inputMode} onChange={(e) => onChange(e.target.value)}/></label>;
}
function Hash({ label, value }: { label: string; value: string }) { return <div><div className="label">{label}</div><code className="mt-2 block break-all text-xs leading-5">{value}</code></div>; }
function readable(value: string) { return value.replace(/^POOL_[A-Z_]+:/, "").replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()); }
