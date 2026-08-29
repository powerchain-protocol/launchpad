import {
  assertLaunchTransition,
  buildLaunchConfigureReview,
  buildTokenDeployReview,
  validateLaunchDraft,
  validateReviewHash,
  type GraduationPreview,
  type LaunchDraft,
  type LaunchRecord,
  type LaunchSimulationResult,
  type PreparedTransaction,
} from "@powerchain/launchpad-domain/launch";
import type {
  LaunchAdapterRegistry,
} from "@powerchain/launchpad-program-client/launch/adapter";
import type { GraduationAdapterRegistryRepository } from "./graduation-registry";
import { requireApprovedGraduationAdapter } from "./graduation-registry";
import type { LaunchRepository } from "./repository";
import {
  createSignedReviewSnapshot,
  hashLaunchConfiguration,
  type ReviewSnapshotRepository,
  type ReviewSnapshotSigner,
} from "./review-snapshot";

export class LaunchService {
  constructor(
    private readonly repository: LaunchRepository,
    private readonly adapters: LaunchAdapterRegistry,
    private readonly graduationRegistry: GraduationAdapterRegistryRepository,
    private readonly reviewSnapshots: ReviewSnapshotRepository,
    private readonly reviewSigner: ReviewSnapshotSigner,
  ) {}

  async create(draft: LaunchDraft): Promise<LaunchRecord> {
    validateLaunchDraft(draft);
    return this.repository.create(draft);
  }

  async get(id: string): Promise<LaunchRecord> {
    return this.requireLaunch(id);
  }

  async prepareToken(id: string): Promise<PreparedTransaction> {
    const launch = await this.requireLaunch(id);
    if (launch.status !== "DRAFT") {
      throw new Error(`Token deployment cannot be prepared from ${launch.status}.`);
    }

    buildTokenDeployReview(launch);
    const prepared = await this.adapters[launch.chain].prepareTokenDeployment(launch);

    assertLaunchTransition(launch.status, "TOKEN_DEPLOY_PENDING");
    await this.repository.update(id, {
      status: "TOKEN_DEPLOY_PENDING",
      updatedAt: new Date().toISOString(),
    });

    return prepared;
  }

  async confirmToken(id: string, transactionId: string): Promise<LaunchRecord> {
    const launch = await this.requireLaunch(id);
    if (launch.status !== "TOKEN_DEPLOY_PENDING") {
      throw new Error(`Token deployment cannot be confirmed from ${launch.status}.`);
    }

    const result = await this.adapters[launch.chain].verifyTokenDeployment(launch, transactionId);
    if (!result.verified) {
      throw new Error(result.reason ?? "Token deployment could not be verified on-chain.");
    }

    assertLaunchTransition(launch.status, "TOKEN_DEPLOYED");
    return this.repository.update(id, {
      status: "TOKEN_DEPLOYED",
      tokenDeployTx: result.transactionId,
      tokenAddress: result.tokenAddress,
      packageId: result.packageId,
      treasuryCapObjectId: result.treasuryCapObjectId,
      updatedAt: new Date().toISOString(),
    });
  }

  async simulateConfiguration(id: string): Promise<LaunchSimulationResult> {
    const launch = await this.requireLaunch(id);
    if (launch.status !== "TOKEN_DEPLOYED") {
      throw new Error(`Tx 2 simulation requires TOKEN_DEPLOYED; got ${launch.status}.`);
    }

    const adapter = await requireApprovedGraduationAdapter(
      this.graduationRegistry,
      launch.chain,
      launch.graduation.venue,
    );
    const { hash } = hashLaunchConfiguration(launch, adapter);

    return this.adapters[launch.chain].simulateLaunchConfiguration(launch, {
      reviewHash: hash,
      graduationAdapter: adapter,
    });
  }

  async previewGraduation(id: string): Promise<GraduationPreview> {
    const launch = await this.requireLaunch(id);
    const adapter = await requireApprovedGraduationAdapter(
      this.graduationRegistry,
      launch.chain,
      launch.graduation.venue,
    );
    return this.adapters[launch.chain].previewGraduation(launch, adapter);
  }

  async prepareConfiguration(id: string): Promise<PreparedTransaction> {
    const launch = await this.requireLaunch(id);
    if (launch.status !== "TOKEN_DEPLOYED") {
      throw new Error(`Launch configuration cannot be prepared from ${launch.status}.`);
    }

    const adapter = await requireApprovedGraduationAdapter(
      this.graduationRegistry,
      launch.chain,
      launch.graduation.venue,
    );
    const snapshot = await createSignedReviewSnapshot(
      launch,
      adapter,
      this.reviewSigner,
    );
    validateReviewHash(snapshot.hash);
    await this.reviewSnapshots.insert(snapshot);

    buildLaunchConfigureReview(launch, {
      adapter,
      configurationHash: snapshot.hash,
    });

    const prepared = await this.adapters[launch.chain].prepareLaunchConfiguration(launch, {
      reviewHash: snapshot.hash,
      graduationAdapter: adapter,
    });

    assertLaunchTransition(launch.status, "LAUNCH_CONFIG_PENDING");
    await this.repository.update(id, {
      status: "LAUNCH_CONFIG_PENDING",
      graduationAdapter: adapter,
      reviewHash: snapshot.hash,
      reviewSignature: snapshot.signature,
      reviewKeyId: snapshot.keyId,
      updatedAt: new Date().toISOString(),
    });

    return { ...prepared, reviewSnapshot: snapshot };
  }

  async confirmConfiguration(id: string, transactionId: string): Promise<LaunchRecord> {
    const launch = await this.requireLaunch(id);
    if (launch.status !== "LAUNCH_CONFIG_PENDING") {
      throw new Error(`Launch configuration cannot be confirmed from ${launch.status}.`);
    }
    if (!launch.reviewHash) throw new Error("Launch is missing the signed Tx 2 review hash.");

    const result = await this.adapters[launch.chain].verifyLaunchConfiguration(launch, transactionId);
    if (!result.verified) {
      throw new Error(result.reason ?? "Launch configuration could not be verified on-chain.");
    }
    if (!result.reviewHash || result.reviewHash.toLowerCase() !== launch.reviewHash.toLowerCase()) {
      throw new Error("Submitted Tx 2 does not match the signed configuration snapshot reviewed by the creator.");
    }

    assertLaunchTransition(launch.status, "LIVE");
    const now = new Date().toISOString();
    return this.repository.update(id, {
      status: "LIVE",
      graduationVenueLocked: true,
      configureTx: result.transactionId,
      vestingAddress: result.vestingAddress,
      updatedAt: now,
      launchedAt: now,
    });
  }

  private async requireLaunch(id: string): Promise<LaunchRecord> {
    const launch = await this.repository.getById(id);
    if (!launch) throw new Error("Launch not found.");
    return launch;
  }
}
