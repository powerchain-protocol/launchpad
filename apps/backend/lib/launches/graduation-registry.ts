import type {
  GraduationAdapterSelection,
  LaunchChain,
} from "@powerchain/launchpad-domain/launch";

export interface GraduationAdapterRegistryEntry extends GraduationAdapterSelection {
  chain: LaunchChain;
  venue: string;
  status: "active" | "disabled" | "deprecated";
  governanceProposalId?: string;
  approvedAt: string;
}

/** Mirror/port for the governance-controlled adapter registry. */
export interface GraduationAdapterRegistryRepository {
  resolveActive(chain: LaunchChain, venue: string): Promise<GraduationAdapterRegistryEntry | null>;
  get(registryId: string): Promise<GraduationAdapterRegistryEntry | null>;
}

export async function requireApprovedGraduationAdapter(
  registry: GraduationAdapterRegistryRepository,
  chain: LaunchChain,
  venue: string,
): Promise<GraduationAdapterRegistryEntry> {
  const entry = await registry.resolveActive(chain, venue);
  if (!entry || entry.status !== "active") {
    throw new Error(`No governance-approved graduation adapter is active for ${chain}/${venue}.`);
  }
  return entry;
}
