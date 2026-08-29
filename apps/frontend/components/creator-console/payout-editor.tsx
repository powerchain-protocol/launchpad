"use client";

import type { PayoutSplit } from "@powerchain/launchpad-domain/launch";

export function PayoutEditor({ value, onChange }: { value: PayoutSplit[]; onChange: (next: PayoutSplit[]) => void }) {
  const total = value.reduce((sum, item) => sum + item.basisPoints, 0);
  const update = (index: number, patch: Partial<PayoutSplit>) => onChange(value.map((item, i) => i === index ? { ...item, ...patch } : item));
  return (
    <section className="card stack">
      <div className="section-heading"><div><div className="label">Payout policy</div><h2>Recipients</h2></div><strong className={total === 10_000 ? "good" : "danger"}>{total.toLocaleString()} / 10,000 bps</strong></div>
      {value.map((item, index) => <div className="grid payout" key={`${index}-${item.label ?? "split"}`}>
        <label className="field"><span>Label</span><input value={item.label ?? ""} onChange={(e) => update(index, { label: e.target.value })} /></label>
        <label className="field"><span>Recipient</span><input value={item.recipient} onChange={(e) => update(index, { recipient: e.target.value })} /></label>
        <label className="field"><span>Basis points</span><input type="number" min="1" max="10000" value={item.basisPoints} onChange={(e) => update(index, { basisPoints: Number(e.target.value) })} /></label>
        <button className="button ghost" type="button" disabled={value.length === 1} onClick={() => onChange(value.filter((_, i) => i !== index))}>Remove</button>
      </div>)}
      <button className="button secondary" type="button" disabled={value.length >= 20} onClick={() => onChange([...value, { recipient: "", basisPoints: 1, label: `Recipient ${value.length + 1}` }])}>Add recipient</button>
    </section>
  );
}
