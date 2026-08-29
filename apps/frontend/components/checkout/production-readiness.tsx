import type { RuntimeReadinessReport } from "@powerchain/launchpad-domain/checkout";

export function ProductionReadiness({ report }: { report: RuntimeReadinessReport }) {
  const ready = report.liveTransfersEnabled;
  return (
    <section
      aria-live="polite"
      className={[
        "rounded-2xl border p-4",
        ready
          ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
          : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em]">Runtime readiness</p>
          <h2 className="mt-1 text-base font-semibold">
            {ready ? "Live transfers ready" : "Live transfers fail-closed"}
          </h2>
          <p className="mt-1 text-sm opacity-80">
            Mode: {report.mode}. Wallet signatures remain required for all transfer execution.
          </p>
        </div>
        <span className="rounded-full border border-current/20 px-2.5 py-1 text-xs font-semibold">
          {ready ? "READY" : "BLOCKED"}
        </span>
      </div>
      {!ready && report.blockers.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {report.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
