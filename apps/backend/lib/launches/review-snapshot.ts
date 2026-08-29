import { createHash, createPrivateKey, sign } from "node:crypto";
import {
  canonicalLaunchConfiguration,
  type ConfigurationReviewSnapshot,
  type GraduationAdapterSelection,
  type LaunchRecord,
} from "@powerchain/launchpad-domain/launch";

export interface ReviewSnapshotSigner {
  keyId: string;
  signHash(hashHex: string): Promise<string>;
}

export class Ed25519ReviewSnapshotSigner implements ReviewSnapshotSigner {
  constructor(
    public readonly keyId: string,
    private readonly privateKeyPem: string,
  ) {}

  async signHash(hashHex: string): Promise<string> {
    const key = createPrivateKey(this.privateKeyPem);
    return sign(null, Buffer.from(hashHex, "hex"), key).toString("base64url");
  }
}

export interface ReviewSnapshotRepository {
  insert(snapshot: ConfigurationReviewSnapshot): Promise<void>;
  getByHash(hash: string): Promise<ConfigurationReviewSnapshot | null>;
}

export function hashLaunchConfiguration(
  launch: LaunchRecord,
  adapter: GraduationAdapterSelection,
): { canonicalPayload: string; hash: string } {
  const canonicalPayload = canonicalLaunchConfiguration(launch, adapter);
  const hash = createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
  return { canonicalPayload, hash };
}

export async function createSignedReviewSnapshot(
  launch: LaunchRecord,
  adapter: GraduationAdapterSelection,
  signer: ReviewSnapshotSigner,
): Promise<ConfigurationReviewSnapshot> {
  const { canonicalPayload, hash } = hashLaunchConfiguration(launch, adapter);
  const signature = await signer.signHash(hash);
  return {
    launchId: launch.id,
    chain: launch.chain,
    stage: "LAUNCH_CONFIG",
    hashAlgorithm: "sha256",
    hash,
    signatureAlgorithm: "ed25519",
    signature,
    keyId: signer.keyId,
    canonicalPayload,
    createdAt: new Date().toISOString(),
  };
}
