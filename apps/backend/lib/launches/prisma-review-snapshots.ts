import type { PrismaClient } from "../../../../generated/prisma/client";
import type { ConfigurationReviewSnapshot } from "@powerchain/launchpad-domain/launch";
import type { ReviewSnapshotRepository } from "./review-snapshot";

export type PrismaReviewSnapshotClient = Pick<PrismaClient, "configurationReviewSnapshot">;

export class PrismaReviewSnapshotRepository implements ReviewSnapshotRepository {
  constructor(private readonly prisma: PrismaReviewSnapshotClient) {}

  async insert(snapshot: ConfigurationReviewSnapshot): Promise<void> {
    await this.prisma.configurationReviewSnapshot.create({
      data: {
        hash: snapshot.hash,
        launchId: snapshot.launchId,
        chain: snapshot.chain,
        stage: snapshot.stage,
        hashAlgorithm: snapshot.hashAlgorithm,
        signatureAlgorithm: snapshot.signatureAlgorithm,
        signature: snapshot.signature,
        keyId: snapshot.keyId,
        canonicalPayload: snapshot.canonicalPayload,
        createdAt: new Date(snapshot.createdAt),
      },
    });
  }

  async getByHash(hash: string): Promise<ConfigurationReviewSnapshot | null> {
    const row = await this.prisma.configurationReviewSnapshot.findUnique({ where: { hash } });
    if (!row) return null;
    if (row.chain !== "solana" && row.chain !== "sui") throw new Error(`Invalid review snapshot chain: ${row.chain}`);
    return {
      hash: row.hash,
      launchId: row.launchId,
      chain: row.chain,
      stage: "LAUNCH_CONFIG",
      hashAlgorithm: "sha256",
      signatureAlgorithm: "ed25519",
      signature: row.signature,
      keyId: row.keyId,
      canonicalPayload: row.canonicalPayload,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
