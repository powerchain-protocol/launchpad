import type {
  Launch as PrismaLaunch,
  LaunchDevBuy as PrismaLaunchDevBuy,
  LaunchPayout as PrismaLaunchPayout,
  PrismaClient,
} from "../../../../generated/prisma/client";
import type {
  LaunchChain,
  LaunchDraft,
  LaunchRecord,
  VestingTemplate,
} from "@powerchain/launchpad-domain/launch";
import type { LaunchRepository } from "./repository";

export type PrismaLaunchClient = Pick<
  PrismaClient,
  "launch" | "graduationAdapter" | "configurationReviewSnapshot"
>;

type LaunchWithRelations = PrismaLaunch & {
  payouts: PrismaLaunchPayout[];
  devBuy: PrismaLaunchDevBuy | null;
};

function asChain(value: string): LaunchChain {
  if (value !== "solana" && value !== "sui") throw new Error(`Invalid persisted launch chain: ${value}`);
  return value;
}

function asVestingTemplate(value: unknown): VestingTemplate | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as VestingTemplate;
}

function mapLaunch(row: LaunchWithRelations): LaunchRecord {
  const chain = asChain(row.chain);
  const devTemplate = asVestingTemplate(row.devBuy?.vestingTemplateJson);
  return {
    id: row.id,
    chain,
    creatorWallet: row.creatorWallet,
    token: {
      name: row.tokenName,
      symbol: row.tokenSymbol,
      description: row.tokenDescription,
      iconUri: row.tokenIconUri,
      decimals: row.tokenDecimals,
    },
    curve: {
      kind: "bonding-curve",
      initialPriceAtomic: row.initialPriceAtomic,
      graduationThresholdAtomic: row.graduationThresholdAtomic,
    },
    payoutSplits: row.payouts.map((payout) => ({
      recipient: payout.recipient,
      basisPoints: payout.basisPoints,
      ...(payout.label ? { label: payout.label } : {}),
    })),
    graduation: {
      chain,
      venue: row.graduationVenue as never,
    },
    antiBot: {
      enabled: row.antiBotDelaySeconds > 0,
      delaySeconds: row.antiBotDelaySeconds,
    },
    ...(row.maxPerWalletAtomic
      ? { initialPurchaseLimit: { enabled: true, maxPerWalletAtomic: row.maxPerWalletAtomic } }
      : {}),
    ...(row.opensAt && row.closesAt
      ? {
          launchWindow: {
            enabled: true,
            opensAt: row.opensAt.toISOString(),
            closesAt: row.closesAt.toISOString(),
          },
        }
      : {}),
    ...(row.eligibilityMode
      ? {
          eligibility: {
            mode: row.eligibilityMode as "public" | "allowlist" | "private",
            ...(row.eligibilityPolicyId ? { policyId: row.eligibilityPolicyId } : {}),
            ...(row.eligibilityCommitment ? { commitment: row.eligibilityCommitment } : {}),
          },
        }
      : {}),
    ...(row.devBuy?.enabled
      ? {
          devBuy: {
            enabled: true,
            paymentAsset: row.devBuy.paymentAsset,
            amountAtomic: row.devBuy.amountAtomic,
            ...(row.devBuy.vestingEnabled && devTemplate
              ? { vesting: { enabled: true, template: devTemplate } }
              : {}),
          },
        }
      : {}),
    status: row.status as LaunchRecord["status"],
    graduationVenueLocked: row.graduationVenueLocked,
    ...(row.graduationAdapterRegistryId && row.graduationAdapterId && row.graduationAdapterVersion !== null
      ? {
          graduationAdapter: {
            registryId: row.graduationAdapterRegistryId,
            adapterId: row.graduationAdapterId,
            version: row.graduationAdapterVersion,
            ...(row.graduationAdapterEntry ? { registryEntryAddress: row.graduationAdapterEntry } : {}),
            ...(row.graduationAdapterConfigHash ? { configHash: row.graduationAdapterConfigHash } : {}),
          },
        }
      : {}),
    ...(row.reviewHash ? { reviewHash: row.reviewHash } : {}),
    ...(row.reviewSignature ? { reviewSignature: row.reviewSignature } : {}),
    ...(row.reviewKeyId ? { reviewKeyId: row.reviewKeyId } : {}),
    ...(row.tokenAddress ? { tokenAddress: row.tokenAddress } : {}),
    ...(row.packageId ? { packageId: row.packageId } : {}),
    ...(row.treasuryCapObjectId ? { treasuryCapObjectId: row.treasuryCapObjectId } : {}),
    ...(row.tokenDeployTx ? { tokenDeployTx: row.tokenDeployTx } : {}),
    ...(row.configureTx ? { configureTx: row.configureTx } : {}),
    ...(row.vestingAddress ? { vestingAddress: row.vestingAddress } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.launchedAt ? { launchedAt: row.launchedAt.toISOString() } : {}),
  };
}

function relationInclude() {
  return { payouts: true, devBuy: true } as const;
}

export class PrismaLaunchRepository implements LaunchRepository {
  constructor(private readonly prisma: PrismaLaunchClient) {}

  async create(draft: LaunchDraft): Promise<LaunchRecord> {
    const row = await this.prisma.launch.create({
      data: {
        id: draft.id,
        chain: draft.chain,
        creatorWallet: draft.creatorWallet,
        tokenName: draft.token.name,
        tokenSymbol: draft.token.symbol,
        tokenDescription: draft.token.description,
        tokenIconUri: draft.token.iconUri,
        tokenDecimals: draft.token.decimals,
        curveKind: draft.curve.kind,
        initialPriceAtomic: draft.curve.initialPriceAtomic,
        graduationThresholdAtomic: draft.curve.graduationThresholdAtomic,
        status: "DRAFT",
        graduationVenue: draft.graduation.venue,
        antiBotDelaySeconds: draft.antiBot.enabled ? draft.antiBot.delaySeconds : 0,
        ...(draft.launchWindow?.enabled && draft.launchWindow.opensAt && draft.launchWindow.closesAt
          ? { opensAt: new Date(draft.launchWindow.opensAt), closesAt: new Date(draft.launchWindow.closesAt) }
          : {}),
        ...(draft.initialPurchaseLimit?.enabled && draft.initialPurchaseLimit.maxPerWalletAtomic
          ? { maxPerWalletAtomic: draft.initialPurchaseLimit.maxPerWalletAtomic }
          : {}),
        ...(draft.eligibility
          ? {
              eligibilityMode: draft.eligibility.mode,
              ...(draft.eligibility.policyId ? { eligibilityPolicyId: draft.eligibility.policyId } : {}),
              ...(draft.eligibility.commitment ? { eligibilityCommitment: draft.eligibility.commitment } : {}),
            }
          : {}),
        payouts: {
          create: draft.payoutSplits.map((payout) => ({
            recipient: payout.recipient,
            basisPoints: payout.basisPoints,
            ...(payout.label ? { label: payout.label } : {}),
          })),
        },
        ...(draft.devBuy?.enabled
          ? {
              devBuy: {
                create: {
                  enabled: true,
                  paymentAsset: draft.devBuy.paymentAsset,
                  amountAtomic: draft.devBuy.amountAtomic,
                  vestingEnabled: Boolean(draft.devBuy.vesting?.enabled),
                  ...(draft.devBuy.vesting?.enabled
                    ? { vestingTemplateJson: draft.devBuy.vesting.template as never }
                    : {}),
                },
              },
            }
          : {}),
      },
      include: relationInclude(),
    });
    return mapLaunch(row);
  }

  async getById(id: string): Promise<LaunchRecord | null> {
    const row = await this.prisma.launch.findUnique({ where: { id }, include: relationInclude() });
    return row ? mapLaunch(row) : null;
  }

  async listForAnalytics(filters?: { chain?: "solana" | "sui"; status?: string }): Promise<LaunchRecord[]> {
    const rows = await this.prisma.launch.findMany({
      where: {
        ...(filters?.chain ? { chain: filters.chain } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: relationInclude(),
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapLaunch);
  }

  async update(id: string, patch: Parameters<LaunchRepository["update"]>[1]): Promise<LaunchRecord> {
    const adapter = patch.graduationAdapter;
    const row = await this.prisma.launch.update({
      where: { id },
      data: {
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.graduationVenueLocked !== undefined ? { graduationVenueLocked: patch.graduationVenueLocked } : {}),
        ...(patch.tokenAddress !== undefined ? { tokenAddress: patch.tokenAddress } : {}),
        ...(patch.packageId !== undefined ? { packageId: patch.packageId } : {}),
        ...(patch.treasuryCapObjectId !== undefined ? { treasuryCapObjectId: patch.treasuryCapObjectId } : {}),
        ...(patch.tokenDeployTx !== undefined ? { tokenDeployTx: patch.tokenDeployTx } : {}),
        ...(patch.configureTx !== undefined ? { configureTx: patch.configureTx } : {}),
        ...(patch.vestingAddress !== undefined ? { vestingAddress: patch.vestingAddress } : {}),
        ...(adapter
          ? {
              graduationAdapterRegistryId: adapter.registryId,
              graduationAdapterId: adapter.adapterId,
              graduationAdapterVersion: adapter.version,
              graduationAdapterEntry: adapter.registryEntryAddress ?? null,
              graduationAdapterConfigHash: adapter.configHash ?? null,
            }
          : {}),
        ...(patch.reviewHash !== undefined ? { reviewHash: patch.reviewHash } : {}),
        ...(patch.reviewSignature !== undefined ? { reviewSignature: patch.reviewSignature } : {}),
        ...(patch.reviewKeyId !== undefined ? { reviewKeyId: patch.reviewKeyId } : {}),
        ...(patch.launchedAt !== undefined ? { launchedAt: new Date(patch.launchedAt) } : {}),
        updatedAt: new Date(patch.updatedAt ?? new Date().toISOString()),
      },
      include: relationInclude(),
    });
    return mapLaunch(row);
  }
}
