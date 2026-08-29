import type {
  GraduationAdapterSelection,
  GraduationPreview,
  LaunchDraft,
  LaunchRecord,
  LaunchSimulationResult,
  PreparedTransaction,
  VerificationResult,
} from "@powerchain/launchpad-domain/launch";

export interface LaunchConfigurationPreparationContext {
  reviewHash: string;
  graduationAdapter: GraduationAdapterSelection;
}

export interface LaunchChainAdapter {
  prepareTokenDeployment(launch: LaunchDraft): Promise<PreparedTransaction>;
  verifyTokenDeployment(
    launch: LaunchRecord,
    transactionId: string,
  ): Promise<VerificationResult>;

  simulateLaunchConfiguration(
    launch: LaunchRecord,
    context: LaunchConfigurationPreparationContext,
  ): Promise<LaunchSimulationResult>;

  prepareLaunchConfiguration(
    launch: LaunchRecord,
    context: LaunchConfigurationPreparationContext,
  ): Promise<PreparedTransaction>;

  verifyLaunchConfiguration(
    launch: LaunchRecord,
    transactionId: string,
  ): Promise<VerificationResult>;

  previewGraduation(
    launch: LaunchRecord,
    graduationAdapter: GraduationAdapterSelection,
  ): Promise<GraduationPreview>;
}

export type LaunchAdapterRegistry = Record<
  LaunchDraft["chain"],
  LaunchChainAdapter
>;
