import type { SettlementEvidence, SettlementState } from "@powerchain/launchpad-domain/checkout";

const ORDER: SettlementState[] = [
  "QUOTED",
  "AWAITING_SIGNATURE",
  "SUBMITTED",
  "CONFIRMING",
  "SETTLED",
  "RECONCILED",
  "RECEIPTED",
];

export function SettlementTimeline({ evidence }: { evidence: SettlementEvidence }) {
  const currentIndex = ORDER.indexOf(evidence.state);
  const unknown = evidence.state === "EXECUTION_UNKNOWN";

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">Settlement status</h3>
      {unknown ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          Transaction outcome is currently unknown. Funds and token allocation must not be credited or retried until RPC reconciliation resolves the transaction.
        </div>
      ) : null}
      <ol className="mt-4 grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {ORDER.map((state, index) => {
          const done = currentIndex >= index;
          return (
            <li key={state} className="min-w-0">
              <div className={[
                "h-1.5 rounded-full",
                done ? "bg-emerald-800" : "bg-zinc-200 dark:bg-zinc-800",
              ].join(" ")} />
              <p className="mt-2 truncate text-[11px] font-medium text-zinc-600 dark:text-zinc-400">{state}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
