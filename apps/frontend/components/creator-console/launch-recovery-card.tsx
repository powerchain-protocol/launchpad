import type { LaunchRecord } from "@powerchain/launchpad-domain/launch";

export function LaunchRecoveryCard({ launch, onRebuild, busy = false }: {
  launch: LaunchRecord;
  onRebuild: () => void;
  busy?: boolean;
}) {
  const pending = launch.status === "TOKEN_DEPLOY_PENDING" || launch.status === "LAUNCH_CONFIG_PENDING";
  if (!pending) return null;
  const tx = launch.status === "TOKEN_DEPLOY_PENDING" ? "Tx 1" : "Tx 2";
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <h3 className="text-sm font-semibold">{tx} is pending</h3>
      <p className="mt-1 text-sm opacity-80">
        If the unsigned transaction expired or the wallet rejected stale chain data, rebuild it from the same committed launch configuration. This does not create a third launch signature.
      </p>
      <button type="button" disabled={busy} onClick={onRebuild} className="mt-3 h-10 rounded-xl bg-amber-950 px-4 text-sm font-semibold text-white disabled:opacity-50">
        Rebuild {tx}
      </button>
    </section>
  );
}
