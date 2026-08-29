"use client";

import type {
  InitialPurchaseLimitConfig,
  LaunchEligibilityConfig,
  LaunchWindowConfig,
} from "@powerchain/launchpad-domain/launch";

export function LaunchControls(props: {
  purchaseLimit: InitialPurchaseLimitConfig;
  launchWindow: LaunchWindowConfig;
  eligibility: LaunchEligibilityConfig;
  onPurchaseLimitChange: (value: InitialPurchaseLimitConfig) => void;
  onLaunchWindowChange: (value: LaunchWindowConfig) => void;
  onEligibilityChange: (value: LaunchEligibilityConfig) => void;
}) {
  return (
    <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">Launch access controls</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          These rules are committed in transaction 2 and do not create another wallet signature.
        </p>
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={props.purchaseLimit.enabled}
          onChange={(event) => props.onPurchaseLimitChange({
            enabled: event.target.checked,
            maxPerWalletAtomic: event.target.checked ? props.purchaseLimit.maxPerWalletAtomic ?? "" : undefined,
          })}
        />
        <span className="flex-1">
          <span className="block text-sm font-medium">Per-wallet initial purchase limit</span>
          {props.purchaseLimit.enabled && (
            <input
              className="mt-2 h-10 w-full rounded-lg border border-zinc-300 px-3 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
              inputMode="numeric"
              value={props.purchaseLimit.maxPerWalletAtomic ?? ""}
              onChange={(event) => props.onPurchaseLimitChange({ enabled: true, maxPerWalletAtomic: event.target.value })}
              placeholder="Atomic units"
            />
          )}
        </span>
      </label>

      <div className="space-y-2">
        <label className="flex items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={props.launchWindow.enabled}
            onChange={(event) => props.onLaunchWindowChange({ enabled: event.target.checked })}
          />
          Configurable launch window
        </label>
        {props.launchWindow.enabled && (
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="datetime-local"
              className="h-10 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              onChange={(event) => props.onLaunchWindowChange({ ...props.launchWindow, opensAt: new Date(event.target.value).toISOString() })}
            />
            <input
              type="datetime-local"
              className="h-10 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              onChange={(event) => props.onLaunchWindowChange({ ...props.launchWindow, closesAt: new Date(event.target.value).toISOString() })}
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Eligibility phase</label>
        <select
          className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={props.eligibility.mode}
          onChange={(event) => props.onEligibilityChange({ mode: event.target.value as LaunchEligibilityConfig["mode"] })}
        >
          <option value="public">Public</option>
          <option value="allowlist">Allowlist</option>
          <option value="private">Private</option>
        </select>
        {props.eligibility.mode !== "public" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="h-10 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="Existing eligibility policy ID"
              value={props.eligibility.policyId ?? ""}
              onChange={(event) => props.onEligibilityChange({ ...props.eligibility, policyId: event.target.value })}
            />
            <input
              className="h-10 rounded-lg border border-zinc-300 px-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="Policy commitment / Merkle root"
              value={props.eligibility.commitment ?? ""}
              onChange={(event) => props.onEligibilityChange({ ...props.eligibility, commitment: event.target.value })}
            />
          </div>
        )}
      </div>
    </section>
  );
}
