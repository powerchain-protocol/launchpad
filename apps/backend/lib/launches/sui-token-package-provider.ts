import { readFile } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { canonicalize, type LaunchDraft } from "@powerchain/launchpad-domain/launch";
import type {
  SuiTokenPackageDescriptor,
  SuiTokenPackageProvider,
} from "@powerchain/launchpad-program-client/launch";
import type { CompiledMovePackage } from "@powerchain/sui/launch";

interface ArtifactFile extends CompiledMovePackage {
  tokenDefinitionHash: string;
}

function tokenDefinitionHash(launch: LaunchDraft & { chain: "sui" }): string {
  const payload = canonicalize({
    chain: launch.chain,
    token: launch.token,
  });
  return Array.from(sha256(utf8ToBytes(payload)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Reads compiled, immutable Move template artifacts produced by the controlled
 * build worker. The artifact is cryptographically bound to the token definition
 * reviewed by the creator; arbitrary creator Move source is never accepted.
 */
export class FilesystemSuiTokenPackageProvider implements SuiTokenPackageProvider {
  constructor(private readonly artifactsDirectory: string) {}

  async describe(launch: LaunchDraft & { chain: "sui" }): Promise<SuiTokenPackageDescriptor> {
    const artifact = await this.read(launch);
    return { moduleName: artifact.moduleName, coinTypeName: artifact.coinTypeName };
  }

  async compile(launch: LaunchDraft & { chain: "sui" }): Promise<CompiledMovePackage> {
    const artifact = await this.read(launch);
    return {
      modules: artifact.modules,
      dependencies: artifact.dependencies,
      moduleName: artifact.moduleName,
      coinTypeName: artifact.coinTypeName,
    };
  }

  private async read(launch: LaunchDraft & { chain: "sui" }): Promise<ArtifactFile> {
    if (!/^[a-zA-Z0-9_-]+$/.test(launch.id)) throw new Error("Launch id is not safe for artifact lookup.");
    const file = path.join(this.artifactsDirectory, `${launch.id}.json`);
    const raw = JSON.parse(await readFile(file, "utf8")) as ArtifactFile;
    if (!Array.isArray(raw.modules) || !raw.modules.length || !Array.isArray(raw.dependencies) || !raw.dependencies.length) {
      throw new Error("Compiled Sui token artifact is incomplete.");
    }
    if (!raw.moduleName?.trim() || !raw.coinTypeName?.trim()) throw new Error("Compiled Sui token artifact is missing type metadata.");
    if (raw.tokenDefinitionHash.toLowerCase() !== tokenDefinitionHash(launch)) {
      throw new Error("Compiled Sui token artifact does not match the reviewed token definition.");
    }
    return raw;
  }
}
