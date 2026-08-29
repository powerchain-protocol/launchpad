"use client";

import type { VestingTemplate } from "@powerchain/launchpad-domain/launch";

export function VestingTemplateEditor(props: {
  value: VestingTemplate;
  onChange: (value: VestingTemplate) => void;
}) {
  const schedule = props.value.schedule;
  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h2 className="text-base font-semibold">Creator vesting template</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Linear or progressive claims are encoded into transaction 2.</p>
      </div>
      <input
        className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        value={props.value.name}
        onChange={(e) => props.onChange({ ...props.value, name: e.target.value })}
        placeholder="Template name"
      />
      <select
        className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        value={schedule.kind}
        onChange={(e) => props.onChange({
          ...props.value,
          schedule: e.target.value === "linear"
            ? { kind: "linear", cliffSeconds: 0, durationSeconds: 31_536_000 }
            : { kind: "progressive", tranches: [{ unlockOffsetSeconds: 0, basisPoints: 10_000 }] },
        })}
      >
        <option value="linear">Linear</option>
        <option value="progressive">Progressive tranches</option>
      </select>
      {schedule.kind === "linear" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <NumberField label="Cliff seconds" value={schedule.cliffSeconds} onChange={(value) => props.onChange({ ...props.value, schedule: { ...schedule, cliffSeconds: value } })} />
          <NumberField label="Duration seconds" value={schedule.durationSeconds} onChange={(value) => props.onChange({ ...props.value, schedule: { ...schedule, durationSeconds: value } })} />
        </div>
      ) : (
        <div className="space-y-2">
          {schedule.tranches.map((tranche, index) => (
            <div key={index} className="grid grid-cols-2 gap-2">
              <NumberField label={`Tranche ${index + 1} offset`} value={tranche.unlockOffsetSeconds} onChange={(value) => {
                const tranches = [...schedule.tranches]; tranches[index] = { ...tranche, unlockOffsetSeconds: value };
                props.onChange({ ...props.value, schedule: { kind: "progressive", tranches } });
              }} />
              <NumberField label="Basis points" value={tranche.basisPoints} onChange={(value) => {
                const tranches = [...schedule.tranches]; tranches[index] = { ...tranche, basisPoints: value };
                props.onChange({ ...props.value, schedule: { kind: "progressive", tranches } });
              }} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function NumberField(props: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-xs text-zinc-500">{props.label}<input type="number" min={0} className="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} /></label>;
}
