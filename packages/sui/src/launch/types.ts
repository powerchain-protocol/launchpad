import type { Transaction, TransactionResult } from "@mysten/sui/transactions";
import type { LaunchDraft } from "@powerchain/launchpad-domain/launch";

export interface CompiledMovePackage {
  modules: Array<string | number[]>;
  dependencies: string[];
  moduleName: string;
  coinTypeName: string;
}

export interface SuiLaunchEnvironment {
  launchpadPackageId: string;
  feeVaultAddress: string;
  graduationRegistryObjectId: string;
}

export interface SuiDevBuyCompositionContext {
  tx: Transaction;
  launch: LaunchDraft & { chain: "sui" };
  launchObject: TransactionResult;
  tokenType: string;
}

export type SuiDevBuyComposer = (
  context: SuiDevBuyCompositionContext,
) => TransactionResult;

export interface SuiBuiltTransaction {
  transaction: Transaction;
  atomicDevBuyVesting: boolean;
}
