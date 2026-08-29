import type { LaunchSimulationResult } from "@powerchain/launchpad-domain/launch";

export function Tx2SimulationReview({ simulation }: { simulation: LaunchSimulationResult }) {
  const chain = simulation.chainSimulation;
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-400">Pre-sign simulation</p>
          <h2 className="mt-1 text-lg font-semibold">Expected transaction 2 effects</h2>
        </div>
        <span className={chain?.success === false ? "text-sm font-medium text-red-700" : "text-sm font-medium text-emerald-800"}>
          {chain ? (chain.success ? "Simulation passed" : "Simulation failed") : "Deterministic preview"}
        </span>
      </div>

      <div className="mt-4 rounded-xl bg-zinc-50 p-4 font-mono text-xs dark:bg-zinc-900">
        <div className="text-zinc-500">Configuration hash</div>
        <div className="mt-1 break-all">{simulation.configurationHash}</div>
      </div>

      {simulation.warnings.length > 0 && (
        <ul className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {simulation.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
        </ul>
      )}
    </section>
  );
}
