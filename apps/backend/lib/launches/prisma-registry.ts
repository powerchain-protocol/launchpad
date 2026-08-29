import type { PrismaClient } from "../../../../generated/prisma/client";
import type { LaunchChain } from "@powerchain/launchpad-domain/launch";
import type {
  GraduationAdapterRegistryEntry,
  GraduationAdapterRegistryRepository,
} from "./graduation-registry";

export type PrismaGraduationRegistryClient = Pick<PrismaClient, "graduationAdapter">;

function mapEntry(row: {
  id: string;
  chain: string;
  venue: string;
  version: number;
  registryId: string;
  registryEntryAddress: string | null;
  configHash: string | null;
  status: string;
  governanceProposalId: string | null;
  approvedAt: Date;
}): GraduationAdapterRegistryEntry {
  if (row.chain !== "solana" && row.chain !== "sui") throw new Error(`Invalid adapter chain: ${row.chain}`);
  if (row.status !== "active" && row.status !== "disabled" && row.status !== "deprecated") {
    throw new Error(`Invalid adapter status: ${row.status}`);
  }
  return {
    registryId: row.registryId,
    adapterId: row.id,
    version: row.version,
    chain: row.chain,
    venue: row.venue,
    status: row.status,
    ...(row.registryEntryAddress ? { registryEntryAddress: row.registryEntryAddress } : {}),
    ...(row.configHash ? { configHash: row.configHash } : {}),
    ...(row.governanceProposalId ? { governanceProposalId: row.governanceProposalId } : {}),
    approvedAt: row.approvedAt.toISOString(),
  };
}

export class PrismaGraduationAdapterRegistry implements GraduationAdapterRegistryRepository {
  constructor(private readonly prisma: PrismaGraduationRegistryClient) {}

  async resolveActive(chain: LaunchChain, venue: string): Promise<GraduationAdapterRegistryEntry | null> {
    const row = await this.prisma.graduationAdapter.findFirst({
      where: { chain, venue, status: "active" },
      orderBy: [{ version: "desc" }, { approvedAt: "desc" }],
    });
    return row ? mapEntry(row) : null;
  }

  async get(registryId: string): Promise<GraduationAdapterRegistryEntry | null> {
    const row = await this.prisma.graduationAdapter.findFirst({ where: { registryId } });
    return row ? mapEntry(row) : null;
  }
}
