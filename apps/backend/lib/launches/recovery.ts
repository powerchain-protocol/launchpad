import type { LaunchRecord, PreparedTransaction } from "@powerchain/launchpad-domain/launch";
import type { LaunchAdapterRegistry } from "@powerchain/launchpad-program-client/launch/adapter";

export interface LaunchRecoveryRepository {
  getById(id: string): Promise<LaunchRecord | null>;
  update(id: string, patch: { updatedAt: string }): Promise<LaunchRecord>;
}

/**
 * Rebuilds an expired/unusable unsigned transaction without creating another
 * launch lifecycle step. The creator still signs only Tx 1 and Tx 2.
 */
export class LaunchPreparationRecoveryService {
  constructor(
    private readonly repository: LaunchRecoveryRepository,
    private readonly adapters: LaunchAdapterRegistry,
  ) {}

  async rebuildPending(id: string): Promise<PreparedTransaction> {
    const launch = await this.repository.getById(id);
    if (!launch) throw new Error("Launch not found.");
    if (launch.status === "TOKEN_DEPLOY_PENDING") {
      return this.adapters[launch.chain].prepareTokenDeployment(launch);
    }
    if (launch.status === "LAUNCH_CONFIG_PENDING") {
      if (!launch.reviewHash || !launch.graduationAdapter) {
        throw new Error("Pending Tx 2 is missing its immutable review commitment.");
      }
      return this.adapters[launch.chain].prepareLaunchConfiguration(launch, {
        reviewHash: launch.reviewHash,
        graduationAdapter: launch.graduationAdapter,
      });
    }
    throw new Error(`No pending transaction can be rebuilt from ${launch.status}.`);
  }
}
