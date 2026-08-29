import type { ConfigurationReviewSnapshot } from "@powerchain/launchpad-domain/launch";

export function ConfigurationIntegrity({ snapshot }: { snapshot: ConfigurationReviewSnapshot }) {
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-300">Configuration integrity</p>
      <h2 className="mt-1 text-base font-semibold text-emerald-950 dark:text-emerald-100">Signed review snapshot</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-emerald-800/70 dark:text-emerald-300/70">SHA-256 review hash</dt><dd className="mt-1 break-all font-mono text-xs">{snapshot.hash}</dd></div>
        <div><dt className="text-emerald-800/70 dark:text-emerald-300/70">Signing key</dt><dd className="mt-1 font-mono text-xs">{snapshot.keyId}</dd></div>
      </dl>
      <p className="mt-4 text-sm text-emerald-900 dark:text-emerald-100">
        Confirmation is rejected unless the hash recovered from the submitted transaction matches this reviewed snapshot.
      </p>
    </section>
  );
}
