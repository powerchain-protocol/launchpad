import type { TransactionReview } from "@powerchain/launchpad-domain/launch";

export interface SolanaPlannedInstruction {
  programId: string;
  name: string;
  accounts: string[];
  data: Record<string, string | number | boolean | string[]>;
}

export interface SolanaInstructionPlan {
  payer: string;
  mint?: string;
  stage: "TOKEN_DEPLOY" | "LAUNCH_CONFIG";
  instructions: SolanaPlannedInstruction[];
  requiredSigners: string[];
  review: TransactionReview;
}

export interface SolanaLaunchEnvironment {
  launchpadProgramId: string;
  serviceFeeRecipient: string;
}
