"use client";

import {
  GRADUATION_VENUES,
  type GraduationVenue,
  type LaunchChain,
} from "@powerchain/launchpad-domain/launch";

const LABELS: Record<GraduationVenue["venue"], string> = {
  raydium: "Raydium",
  meteora: "Meteora",
  orca: "Orca",
  cetus: "Cetus",
  deepbook: "DeepBook",
  turbos: "Turbos",
};

export function GraduationVenueField(props: {
  chain: LaunchChain;
  value?: string;
  locked?: boolean;
  onChange: (venue: GraduationVenue["venue"]) => void;
}) {
  const venues = GRADUATION_VENUES[props.chain];

  return (
    <fieldset className="space-y-3" disabled={props.locked}>
      <div className="space-y-1">
        <legend className="text-sm font-semibold text-zinc-950 dark:text-white">
          Graduation venue
        </legend>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Choose where liquidity moves after the bonding curve reaches its graduation threshold.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {venues.map((venue) => {
          const selected = props.value === venue;
          return (
            <button
              key={venue}
              type="button"
              aria-pressed={selected}
              onClick={() => props.onChange(venue)}
              className={[
                "min-h-16 rounded-xl border px-4 py-3 text-left transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800",
                selected
                  ? "border-emerald-900 bg-emerald-950 text-white"
                  : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white",
              ].join(" ")}
            >
              <span className="block text-sm font-semibold">{LABELS[venue]}</span>
              <span className="mt-1 block text-xs opacity-70">
                {selected ? "Selected" : "Available"}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="note"
        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100"
      >
        This choice is written on-chain in transaction 2 and cannot be changed after confirmation.
      </div>
    </fieldset>
  );
}
