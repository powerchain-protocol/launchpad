"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/components/wallet-provider";
import { signPurpose } from "@/lib/client/wallet-auth";
import type { AuditEvent, PaymentAsset, Sale, SaleTier, TransactionRecord } from "@/types/domain";

type Summary = {
  counts: Record<string, number>;
  transactions: TransactionRecord[];
  audit: AuditEvent[];
  generatedAt: string;
};

const paymentAssets: PaymentAsset[] = ["SOL", "USDC", "PWRC"];

export default function Admin() {
  const { address, connect, signMessage } = useWallet();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [baseline, setBaseline] = useState<Sale | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function fetchSale() {
    const response = await fetch("/api/v1/sales/demo", { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "SALE_LOAD_FAILED");
    setSale(json.sale);
    setBaseline(json.sale);
  }

  useEffect(() => { fetchSale().catch((reason) => setError(reason instanceof Error ? reason.message : "SALE_LOAD_FAILED")); }, []);

  async function authorize(purpose: string) {
    const signer = address || await connect();
    return signPurpose({ address: signer, purpose, signMessage });
  }

  async function loadOperations() {
    try {
      setBusy(true); setError(""); setOk("");
      const auth = await authorize("admin:summary:read");
      const response = await fetch("/api/v1/admin/summary", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(auth) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "ADMIN_SUMMARY_FAILED");
      setSummary(json);
      setOk("Validated operations evidence loaded with one-time wallet authorization.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ADMIN_SUMMARY_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!sale) return;
    try {
      setBusy(true); setError(""); setOk("");
      const auth = await authorize(`admin:sale:${sale.id}:update`);
      const response = await fetch(`/api/v1/sales/${sale.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...auth,
          expectedRevision: sale.revision,
          patch: {
            name: sale.name,
            priceUsd: sale.priceUsd,
            hardCap: sale.hardCap,
            startsAt: sale.startsAt,
            endsAt: sale.endsAt,
            claimAt: sale.claimAt,
            stage: sale.stage,
            validated: sale.validated,
            acceptedAssets: sale.acceptedAssets,
            tiers: sale.tiers,
          },
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        if (response.status === 409 && String(json.error || "").includes("REVISION_CONFLICT")) {
          await fetchSale();
          throw new Error("SALE_CHANGED_BY_ANOTHER_OPERATOR_REFRESHED_LATEST_REVISION");
        }
        throw new Error(json.error || "UPDATE_FAILED");
      }
      setSale(json.sale); setBaseline(json.sale);
      setOk(`Sale revision ${json.sale.revision} saved with one-time wallet authorization.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "UPDATE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  const dirty = useMemo(() => Boolean(sale && baseline && JSON.stringify(sale) !== JSON.stringify(baseline)), [sale, baseline]);
  const rows = summary?.transactions || [];
  const audit = summary?.audit || [];

  return <main className="shell py-10 sm:py-12">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><div className="label">PowerChain operations</div><h1 className="mt-1 text-3xl font-extrabold">Authority console</h1><p className="mt-2 max-w-2xl muted">Validated settlement evidence, signed configuration changes, pool readiness and operator audit events share one fail-closed administrative surface.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/explorer" className="btn">Public explorer</Link><Link href="/dashboard/admin/pools" className="btn btn-primary">Manage launch pools</Link></div>
    </div>

    <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <section className="card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><div className="label">Validated evidence</div><h2 className="mt-2 text-2xl font-extrabold">Operations overview</h2></div>{summary?.generatedAt && <span className="text-xs muted">{new Date(summary.generatedAt).toLocaleTimeString()}</span>}</div>
        <p className="mt-3 muted">Sensitive reads require a one-time challenge bound to the authority wallet and exact action. Unvalidated transactions never enter this table.</p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Counter label="Validated tx" value={summary?.counts.transactions ?? "—"}/><Counter label="Purchases" value={summary?.counts.purchases ?? "—"}/><Counter label="Payments" value={summary?.counts.payments ?? "—"}/><Counter label="Review approved" value={summary?.counts.reviewApprovedPools ?? "—"}/><Counter label="Execution eligible" value={summary?.counts.executionEligiblePools ?? "—"}/><Counter label="Live pools" value={summary?.counts.livePools ?? "—"}/>
        </div>
        <button className="btn btn-primary mt-5 w-full" disabled={busy} aria-busy={busy} onClick={loadOperations}>{busy ? "Authorizing…" : address ? "Sign & load operations" : "Connect admin wallet"}</button>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="label">Sale operations</div><h2 className="mt-2 text-2xl font-extrabold">Update sale details</h2></div>{sale && <span className="status">Revision {sale.revision}</span>}</div>
        {sale && <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={sale.name} onChange={(value) => setSale({ ...sale, name: value })}/>
          <Field label="Price USD" value={String(sale.priceUsd)} inputMode="decimal" onChange={(value) => setSale({ ...sale, priceUsd: Number(value) })}/>
          <Field label="Hard cap" value={String(sale.hardCap)} inputMode="numeric" onChange={(value) => setSale({ ...sale, hardCap: Number(value.replace(/\D/g, "")) })}/>
          <label><span className="label">Stage</span><select className="input mt-2" value={sale.stage} onChange={(event) => setSale({ ...sale, stage: event.target.value as Sale["stage"] })}>{["DRAFT", "SCHEDULED", "LIVE", "ENDED", "CLAIMING", "COMPLETED"].map((stage) => <option key={stage}>{stage}</option>)}</select></label>
          <Field label="Starts at · ISO" value={sale.startsAt} onChange={(value) => setSale({ ...sale, startsAt: value })}/>
          <Field label="Ends at · ISO" value={sale.endsAt} onChange={(value) => setSale({ ...sale, endsAt: value })}/>
          <Field label="Claim at · ISO" value={sale.claimAt} onChange={(value) => setSale({ ...sale, claimAt: value })}/>
          <div><span className="label">Accepted assets</span><div className="mt-2 flex min-h-11 flex-wrap items-center gap-2">{paymentAssets.map((asset) => <label key={asset} className="pool-filter"><input type="checkbox" checked={sale.acceptedAssets?.includes(asset) ?? false} onChange={(event) => setSale({ ...sale, acceptedAssets: toggleAsset(sale.acceptedAssets || [], asset, event.target.checked) })}/><span>{asset}</span></label>)}</div></div>

          <div className="sm:col-span-2 rounded-2xl border border-[var(--line)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="label">Allocation tiers</div><p className="mt-1 text-sm muted">Ranges and bonus basis points are validated server-side.</p></div><button type="button" className="btn" onClick={() => setSale({ ...sale, tiers: [...(sale.tiers || []), newTier(sale.tiers || [])] })}>Add tier</button></div>
            <div className="mt-4 grid gap-3">{(sale.tiers || []).map((tier, index) => <div key={tier.id}><TierEditor tier={tier} onChange={(next) => setSale({ ...sale, tiers: replaceTier(sale.tiers || [], index, next) })} onRemove={() => setSale({ ...sale, tiers: (sale.tiers || []).filter((_, itemIndex) => itemIndex !== index) })}/></div>)}</div>
          </div>

          <label className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-[var(--line)] p-4"><input type="checkbox" checked={sale.validated} onChange={(event) => setSale({ ...sale, validated: event.target.checked })}/><span><b>Configuration validated</b><span className="block text-xs muted">Enable only after mint, merchant wallet, schedule and sale-program configuration have been independently verified.</span></span></label>
          {dirty && <div className="notice notice-warning sm:col-span-2"><b>Unsaved changes.</b> Saving requires a new one-time wallet authorization and the current record revision.</div>}
          <button className="btn btn-primary sm:col-span-2" disabled={busy || !dirty} aria-busy={busy} onClick={save}>{busy ? "Authorizing…" : "Sign & save sale update"}</button>
        </div>}
        <div aria-live="polite">{ok && <p className="mt-4 text-sm text-[var(--green)]">{readable(ok)}</p>}{error && <p className="mt-4 text-sm text-red-700">{readable(error)}</p>}</div>
      </section>
    </div>

    <section className="card mt-5 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4"><div><div className="label">Settlement evidence</div><h2 className="mt-1 text-xl font-extrabold">Validated transactions</h2></div><span className="badge">Validated only</span></div>
      <div className="table-wrap mt-4"><table className="table"><thead><tr><th>Type</th><th>Status</th><th>Amount</th><th>Signature</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td>{row.kind}</td><td>{row.status}</td><td>{row.amount}</td><td>{row.signature ? `${row.signature.slice(0, 12)}…` : "—"}</td></tr>) : <tr><td colSpan={4} className="muted">Authenticate to load validated records.</td></tr>}</tbody></table></div>
    </section>

    <section className="card mt-5 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4"><div><div className="label">Authority audit</div><h2 className="mt-1 text-xl font-extrabold">Recent signed operations</h2></div><span className="status">Append-only view</span></div>
      <div className="mt-4 grid gap-2">{audit.length ? audit.map((event) => <div className="grid gap-2 rounded-xl border border-[var(--line)] p-4 sm:grid-cols-[1fr_auto] sm:items-center" key={event.id}><div className="min-w-0"><b className="block text-sm">{readable(event.action)}</b><span className="mt-1 block break-all text-xs muted">{event.subject ? `${event.subject} · ` : ""}{event.actor.slice(0, 8)}…{event.actor.slice(-6)}</span></div><time className="text-xs muted" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div>) : <p className="text-sm muted">Authenticate to load recent authority audit events.</p>}</div>
    </section>
  </main>;
}

function Field({ label, value, onChange, inputMode }: { label: string; value: string; onChange: (value: string) => void; inputMode?: "text" | "decimal" | "numeric" }) { return <label><span className="label">{label}</span><input className="input mt-2" value={value} inputMode={inputMode} onChange={(event) => onChange(event.target.value)}/></label>; }
function Counter({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl bg-[var(--soft)] p-4"><div className="label">{label}</div><b className="mt-1 block tabular-nums">{value}</b></div>; }
function toggleAsset(current: PaymentAsset[], asset: PaymentAsset, checked: boolean) { return checked ? [...new Set([...current, asset])] : current.filter((item) => item !== asset); }
function newTier(current: SaleTier[]): SaleTier { const sequence = current.length + 1; return { id: `tier-${sequence}-${Date.now().toString(36)}`, name: `Tier ${sequence}`, minAmount: 0, maxAmount: 0, bonusBps: 0, enabled: true }; }
function replaceTier(rows: SaleTier[], index: number, next: SaleTier) { return rows.map((row, itemIndex) => itemIndex === index ? next : row); }
function TierEditor({ tier, onChange, onRemove }: { tier: SaleTier; onChange: (tier: SaleTier) => void; onRemove: () => void }) { return <div className="grid gap-3 rounded-xl bg-[var(--bg)] p-3 sm:grid-cols-[1.1fr_.8fr_.8fr_.65fr_auto] sm:items-end"><Field label="Name" value={tier.name} onChange={(value) => onChange({ ...tier, name: value })}/><Field label="Min" value={String(tier.minAmount)} inputMode="numeric" onChange={(value) => onChange({ ...tier, minAmount: Number(value.replace(/\D/g, "")) })}/><Field label="Max" value={String(tier.maxAmount)} inputMode="numeric" onChange={(value) => onChange({ ...tier, maxAmount: Number(value.replace(/\D/g, "")) })}/><Field label="Bonus bps" value={String(tier.bonusBps)} inputMode="numeric" onChange={(value) => onChange({ ...tier, bonusBps: Number(value.replace(/\D/g, "")) })}/><div className="flex gap-2 pb-0.5"><label className="btn"><input type="checkbox" checked={tier.enabled} onChange={(event) => onChange({ ...tier, enabled: event.target.checked })}/><span>On</span></label><button type="button" className="btn" aria-label={`Remove ${tier.name}`} onClick={onRemove}>×</button></div></div>; }
function readable(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
