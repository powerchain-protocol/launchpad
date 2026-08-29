import type { LaunchDraft, LaunchRecord } from "@powerchain/launchpad-domain/launch";

export interface LaunchRepository {
  create(draft: LaunchDraft): Promise<LaunchRecord>;
  getById(id: string): Promise<LaunchRecord | null>;
  listForAnalytics(filters?: { chain?: "solana" | "sui"; status?: string }): Promise<LaunchRecord[]>;
  update(
    id: string,
    patch: Partial<
      Pick<
        LaunchRecord,
        | "status"
        | "graduationVenueLocked"
        | "tokenAddress"
        | "packageId"
        | "treasuryCapObjectId"
        | "tokenDeployTx"
        | "configureTx"
        | "vestingAddress"
        | "graduationAdapter"
        | "reviewHash"
        | "reviewSignature"
        | "reviewKeyId"
        | "updatedAt"
        | "launchedAt"
      >
    >,
  ): Promise<LaunchRecord>;
}
