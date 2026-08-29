import type { GraduationPreview as Preview } from "@powerchain/launchpad-domain/launch";

export function GraduationPreview({ preview }: { preview: Preview }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-400">Graduation preview</p>
          <h2 className="mt-1 text-lg font-semibold">{preview.venue}</h2>
        </div>
        <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs dark:border-zinc-800">
          {preview.adapter.adapterId} v{preview.adapter.version}
        </span>
      </div>

      {preview.estimatedInitialLiquidity && (
        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          <Metric label="Base liquidity" value={preview.estimatedInitialLiquidity.baseAtomic ?? "Unavailable"} />
          <Metric label="Quote liquidity" value={preview.estimatedInitialLiquidity.quoteAtomic ?? "Unavailable"} />
          <Metric label="Quote asset" value={preview.estimatedInitialLiquidity.quoteAsset ?? "Unavailable"} />
        </dl>
      )}

      <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        {preview.poolParameters.map((parameter) => (
          <div key={parameter.key} className="grid grid-cols-[1fr_auto] gap-4 border-b border-zinc-200 px-4 py-3 text-sm last:border-b-0 dark:border-zinc-800">
            <span className="text-zinc-600 dark:text-zinc-400">{parameter.key}</span>
            <span className="font-mono text-xs">{parameter.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 font-mono text-sm">{value}</dd></div>;
}
