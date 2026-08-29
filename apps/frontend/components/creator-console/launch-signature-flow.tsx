"use client";

import type { LaunchRecord, PreparedTransaction } from "@powerchain/launchpad-domain/launch";
import { LaunchTransactionReview } from "./transaction-review";

type Step = {
  key: "token" | "configure";
  title: string;
  description: string;
  complete: boolean;
};

export function LaunchSignatureFlow(props: {
  launch: LaunchRecord;
  prepared?: PreparedTransaction;
  busy?: boolean;
  onPrepareToken: () => void;
  onSignToken: () => void;
  onPrepareConfiguration: () => void;
  onSignConfiguration: () => void;
}) {
  const tokenComplete = Boolean(props.launch.tokenDeployTx);
  const configComplete = Boolean(props.launch.configureTx);

  const steps: Step[] = [
    {
      key: "token",
      title: props.launch.chain === "sui" ? "Publish token package" : "Create Token-2022 mint",
      description: "Wallet signature 1 of 2",
      complete: tokenComplete,
    },
    {
      key: "configure",
      title: "Configure launch",
      description: "Wallet signature 2 of 2",
      complete: configComplete,
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <aside className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={step.key}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-center gap-3">
              <span className={[
                "grid size-8 place-items-center rounded-full text-sm font-semibold",
                step.complete ? "bg-emerald-950 text-white" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
              ].join(" ")}>
                {step.complete ? "✓" : index + 1}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">{step.title}</h3>
                <p className="text-xs text-zinc-500">{step.description}</p>
              </div>
            </div>
          </div>
        ))}
      </aside>

      <main className="space-y-4">
        {props.prepared ? (
          <LaunchTransactionReview review={props.prepared.review} />
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Ready for wallet review</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              PowerChain prepares the transaction. Your wallet remains the only signer.
            </p>
          </div>
        )}

        {!tokenComplete && (
          <button
            type="button"
            disabled={props.busy}
            onClick={props.prepared?.stage === "TOKEN_DEPLOY" ? props.onSignToken : props.onPrepareToken}
            className="h-11 w-full rounded-xl bg-emerald-950 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {props.prepared?.stage === "TOKEN_DEPLOY" ? "Review in wallet & sign Tx 1" : "Prepare transaction 1"}
          </button>
        )}

        {tokenComplete && !configComplete && (
          <button
            type="button"
            disabled={props.busy}
            onClick={props.prepared?.stage === "LAUNCH_CONFIG" ? props.onSignConfiguration : props.onPrepareConfiguration}
            className="h-11 w-full rounded-xl bg-emerald-950 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {props.prepared?.stage === "LAUNCH_CONFIG" ? "Review in wallet & sign Tx 2" : "Prepare transaction 2"}
          </button>
        )}

        {configComplete && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
            Launch is live. Graduation venue is now immutable.
          </div>
        )}
      </main>
    </div>
  );
}
