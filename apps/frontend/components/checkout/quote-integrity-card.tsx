import type { BoundCheckoutQuote } from "@powerchain/launchpad-domain/checkout";

const truncate = (value: string, head = 8, tail = 8) =>
  value.length <= head + tail + 3 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;

export function QuoteIntegrityCard({ quote }: { quote: BoundCheckoutQuote }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-400">Verified quote</p>
          <h3 className="mt-1 text-base font-semibold text-zinc-950 dark:text-white">Server-authoritative payment terms</h3>
        </div>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          {quote.chain} · {quote.network}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-zinc-500">Wallet bound</dt><dd className="mt-1 font-mono text-xs">{truncate(quote.wallet)}</dd></div>
        <div><dt className="text-zinc-500">Payment</dt><dd className="mt-1 font-semibold">{quote.paymentAsset} · {quote.paymentAmountAtomic} atomic</dd></div>
        <div><dt className="text-zinc-500">Expires</dt><dd className="mt-1">{quote.expiresAt}</dd></div>
        <div><dt className="text-zinc-500">Quote hash</dt><dd className="mt-1 font-mono text-xs">{truncate(quote.quoteHash, 12, 12)}</dd></div>
      </dl>
      <p className="mt-4 border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
        Changing wallet, chain, network, asset, amount, treasury or expiry invalidates this quote.
      </p>
    </section>
  );
}
