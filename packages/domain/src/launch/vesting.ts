import { BASIS_POINTS_TOTAL, MAX_VESTING_TRANCHES } from "./constants";
import type { VestingTemplate } from "./types";

const nonNegativeInteger = (value: number) =>
  Number.isSafeInteger(value) && value >= 0;

export function validateVestingTemplate(template: VestingTemplate): VestingTemplate {
  if (!template.name.trim()) throw new Error("Vesting template name is required.");

  if (template.schedule.kind === "linear") {
    const { cliffSeconds, durationSeconds } = template.schedule;
    if (!nonNegativeInteger(cliffSeconds) || !nonNegativeInteger(durationSeconds)) {
      throw new Error("Linear vesting values must be non-negative integers.");
    }
    if (durationSeconds <= 0 || cliffSeconds > durationSeconds) {
      throw new Error("Linear vesting duration must be positive and at least the cliff.");
    }
    return template;
  }

  const tranches = template.schedule.tranches;
  if (tranches.length < 1 || tranches.length > MAX_VESTING_TRANCHES) {
    throw new Error(`Progressive vesting requires 1-${MAX_VESTING_TRANCHES} tranches.`);
  }

  let previousOffset = -1;
  let totalBps = 0;
  for (const tranche of tranches) {
    if (!nonNegativeInteger(tranche.unlockOffsetSeconds)) {
      throw new Error("Vesting tranche offsets must be non-negative integers.");
    }
    if (tranche.unlockOffsetSeconds <= previousOffset) {
      throw new Error("Vesting tranche offsets must be strictly increasing.");
    }
    if (!Number.isInteger(tranche.basisPoints) || tranche.basisPoints <= 0) {
      throw new Error("Vesting tranche basis points must be positive integers.");
    }
    previousOffset = tranche.unlockOffsetSeconds;
    totalBps += tranche.basisPoints;
  }

  if (totalBps !== BASIS_POINTS_TOTAL) {
    throw new Error(`Progressive vesting tranches must sum to ${BASIS_POINTS_TOTAL} bps.`);
  }
  return template;
}
