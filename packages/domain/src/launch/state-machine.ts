import type { LaunchStatus } from "./types";

const transitions: Record<LaunchStatus, readonly LaunchStatus[]> = {
  DRAFT: ["TOKEN_DEPLOY_PENDING", "FAILED"],
  TOKEN_DEPLOY_PENDING: ["TOKEN_DEPLOYED", "FAILED"],
  TOKEN_DEPLOYED: ["LAUNCH_CONFIG_PENDING", "FAILED"],
  LAUNCH_CONFIG_PENDING: ["LIVE", "FAILED"],
  LIVE: ["GRADUATION_READY", "FAILED"],
  GRADUATION_READY: ["GRADUATING", "FAILED"],
  GRADUATING: ["GRADUATED", "FAILED"],
  GRADUATED: [],
  FAILED: [],
};

export function canTransition(from: LaunchStatus, to: LaunchStatus): boolean {
  return transitions[from].includes(to);
}

export function assertLaunchTransition(from: LaunchStatus, to: LaunchStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid launch transition: ${from} -> ${to}.`);
  }
}

export function nextPendingStatus(
  stage: "TOKEN_DEPLOY" | "LAUNCH_CONFIG",
): LaunchStatus {
  return stage === "TOKEN_DEPLOY" ? "TOKEN_DEPLOY_PENDING" : "LAUNCH_CONFIG_PENDING";
}

export function nextConfirmedStatus(
  stage: "TOKEN_DEPLOY" | "LAUNCH_CONFIG",
): LaunchStatus {
  return stage === "TOKEN_DEPLOY" ? "TOKEN_DEPLOYED" : "LIVE";
}
