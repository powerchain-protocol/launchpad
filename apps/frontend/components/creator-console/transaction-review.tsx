import type { TransactionReview } from "@powerchain/launchpad-domain/launch";

export function LaunchTransactionReview({
  review,
}: {
  review: TransactionReview;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <header className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-400">
            {review.stage === "TOKEN_DEPLOY" ? "Transaction 1 of 2" : "Transaction 2 of 2"}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-white">
            {review.title}
          </h2>
        </div>
        <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
          {review.chain === "solana" ? "Solana" : "Sui"}
        </span>
      </header>

      <dl className="grid gap-3 border-b border-zinc-200 py-4 text-sm dark:border-zinc-800 sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500">Signing wallet</dt>
          <dd className="mt-1 break-all font-mono text-xs text-zinc-950 dark:text-white">{review.wallet}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Instructions</dt>
          <dd className="mt-1 font-semibold text-zinc-950 dark:text-white">{review.instructions.length}</dd>
        </div>
      </dl>

      {review.configurationHash && (
        <div className="my-4 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
          <div className="text-xs font-medium text-zinc-500">Reviewed configuration hash</div>
          <div className="mt-1 break-all font-mono text-xs text-zinc-950 dark:text-white">{review.configurationHash}</div>
        </div>
      )}

      {review.immutableFacts.length > 0 && (
        <div className="my-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/70 dark:bg-amber-950/30">
          <h3 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            Immutable after confirmation
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-200">
            {review.immutableFacts.map((fact) => <li key={fact}>• {fact}</li>)}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        {review.instructions.map((instruction) => (
          <details key={`${instruction.index}-${instruction.action}`} className="rounded-xl border border-zinc-200 dark:border-zinc-800">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-zinc-950 dark:text-white">
              <span className="mr-3 text-zinc-400">{instruction.index + 1}</span>
              {instruction.action}
            </summary>
            <div className="border-t border-zinc-200 px-4 py-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              <div>Program: <span className="font-mono">{instruction.program}</span></div>
              {instruction.accounts?.length ? (
                <div className="mt-2 break-all">Accounts: {instruction.accounts.join(", ")}</div>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
