import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { Transaction, type TransactionResult } from "@mysten/sui/transactions";
import {
  canonicalize,
  SUI_LAUNCH_FEE_MIST,
  validateGraduationAdapterSelection,
  validateLaunchDraft,
  validateReviewHash,
  type GraduationAdapterSelection,
  type LaunchDraft,
  type VestingTemplate,
} from "@powerchain/launchpad-domain/launch";
import type {
  SuiBuiltTransaction,
  SuiDevBuyComposer,
  SuiLaunchEnvironment,
} from "./types";

const venueCode = (venue: "cetus" | "deepbook" | "turbos"): number => {
  switch (venue) {
    case "cetus": return 0;
    case "deepbook": return 1;
    case "turbos": return 2;
  }
};

const eligibilityCode = (mode: "public" | "allowlist" | "private"): number =>
  mode === "public" ? 0 : mode === "allowlist" ? 1 : 2;

function hexBytes(hex: string): number[] {
  if (!/^[a-f0-9]*$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Hex input must be even-length hexadecimal.");
  }
  const bytes: number[] = [];
  for (let index = 0; index < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  return bytes;
}

function hashBytes(value: string): number[] {
  return Array.from(sha256(utf8ToBytes(value)));
}

function commitmentBytes(value?: string): number[] {
  if (!value) return [];
  return /^[a-f0-9]{64}$/i.test(value) ? hexBytes(value) : hashBytes(value);
}

function unixMs(value?: string): bigint {
  return value ? BigInt(Date.parse(value)) : 0n;
}

function vestingTemplateHash(template?: VestingTemplate): number[] {
  return template ? hashBytes(canonicalize(template)) : [];
}

function addVestingCall(
  tx: Transaction,
  packageId: string,
  tokenType: string,
  purchased: TransactionResult,
  beneficiary: string,
  template: VestingTemplate,
): void {
  if (template.schedule.kind === "linear") {
    tx.moveCall({
      target: `${packageId}::vesting::lock_linear_from_launch`,
      typeArguments: [tokenType],
      arguments: [
        purchased,
        tx.pure.address(beneficiary),
        tx.pure.u64(BigInt(template.schedule.cliffSeconds * 1_000)),
        tx.pure.u64(BigInt(template.schedule.durationSeconds * 1_000)),
        tx.object.clock(),
      ],
    });
    return;
  }

  tx.moveCall({
    target: `${packageId}::vesting::lock_progressive_from_launch`,
    typeArguments: [tokenType],
    arguments: [
      purchased,
      tx.pure.address(beneficiary),
      tx.pure.vector("u64", template.schedule.tranches.map((t) => BigInt(t.unlockOffsetSeconds * 1_000))),
      tx.pure.vector("u16", template.schedule.tranches.map((t) => t.basisPoints)),
      tx.object.clock(),
    ],
  });
}

export function buildSuiConfigureLaunchTransaction(
  launch: LaunchDraft & {
    chain: "sui";
    graduation: { chain: "sui"; venue: "cetus" | "deepbook" | "turbos" };
  },
  environment: SuiLaunchEnvironment,
  tokenType: string,
  treasuryCapObjectId: string,
  graduationAdapter: GraduationAdapterSelection,
  reviewHash: string,
  composeDevBuy?: SuiDevBuyComposer,
): SuiBuiltTransaction {
  validateLaunchDraft(launch);
  validateGraduationAdapterSelection(graduationAdapter);
  validateReviewHash(reviewHash);
  if (!environment.launchpadPackageId.trim()) throw new Error("Sui launchpad package id is required.");
  if (!environment.feeVaultAddress.trim()) throw new Error("Sui fee vault is required.");
  if (!environment.graduationRegistryObjectId.trim()) throw new Error("Sui graduation registry object id is required.");
  if (graduationAdapter.registryId !== environment.graduationRegistryObjectId) {
    throw new Error("Graduation adapter registry does not match the configured on-chain registry.");
  }
  if (!graduationAdapter.configHash) throw new Error("Governed graduation adapter configHash is required.");
  if (!tokenType.trim()) throw new Error("Sui token type is required.");
  if (!treasuryCapObjectId.trim()) throw new Error("Sui TreasuryCap object id is required.");
  if (launch.devBuy?.enabled && !composeDevBuy) {
    throw new Error("Enabled Sui dev-buy requires the canonical curve dev-buy composer.");
  }

  const tx = new Transaction();
  tx.setSender(launch.creatorWallet);

  const launchFee = tx.coin({ balance: SUI_LAUNCH_FEE_MIST });
  const recipients = tx.pure.vector("address", launch.payoutSplits.map((split) => split.recipient));
  const bps = tx.pure.vector("u16", launch.payoutSplits.map((split) => split.basisPoints));
  const eligibility = launch.eligibility ?? { mode: "public" as const };
  const devBuy = launch.devBuy?.enabled ? launch.devBuy : undefined;
  const devVesting = devBuy?.vesting?.enabled ? devBuy.vesting : undefined;

  const [launchObject] = tx.moveCall({
    target: `${environment.launchpadPackageId}::launchpad::create_launch`,
    typeArguments: [tokenType],
    arguments: [
      tx.object(environment.graduationRegistryObjectId),
      tx.object(treasuryCapObjectId),
      launchFee,
      tx.pure.address(environment.feeVaultAddress),
      recipients,
      bps,
      tx.pure.u8(venueCode(launch.graduation.venue)),
      tx.pure.vector("u8", hashBytes(graduationAdapter.adapterId)),
      tx.pure.u64(BigInt(graduationAdapter.version)),
      tx.pure.vector("u8", hexBytes(graduationAdapter.configHash)),
      tx.pure.vector("u8", hexBytes(reviewHash)),
      tx.pure.u64(BigInt(launch.antiBot.enabled ? launch.antiBot.delaySeconds * 1_000 : 0)),
      tx.pure.u64(BigInt(launch.curve.initialPriceAtomic)),
      tx.pure.u64(BigInt(launch.curve.graduationThresholdAtomic)),
      tx.pure.u64(BigInt(launch.initialPurchaseLimit?.enabled ? launch.initialPurchaseLimit.maxPerWalletAtomic! : "0")),
      tx.pure.u64(launch.launchWindow?.enabled ? unixMs(launch.launchWindow.opensAt) : 0n),
      tx.pure.u64(launch.launchWindow?.enabled ? unixMs(launch.launchWindow.closesAt) : 0n),
      tx.pure.u8(eligibilityCode(eligibility.mode)),
      tx.pure.vector("u8", eligibility.mode === "public" ? [] : hashBytes(eligibility.policyId ?? "")),
      tx.pure.vector("u8", eligibility.mode === "public" ? [] : commitmentBytes(eligibility.commitment)),
      tx.pure.bool(Boolean(devBuy)),
      tx.pure.u64(BigInt(devBuy?.amountAtomic ?? "0")),
      tx.pure.vector("u8", devBuy ? hashBytes(devBuy.paymentAsset) : []),
      tx.pure.bool(Boolean(devVesting)),
      tx.pure.vector("u8", vestingTemplateHash(devVesting?.template)),
      tx.object.clock(),
    ],
  });

  const atomicDevBuyVesting = Boolean(devBuy && devVesting);

  if (devBuy && composeDevBuy) {
    const purchased = composeDevBuy({ tx, launch, launchObject, tokenType });
    if (devVesting) {
      addVestingCall(tx, environment.launchpadPackageId, tokenType, purchased, launch.creatorWallet, devVesting.template);
    } else {
      tx.transferObjects([purchased], launch.creatorWallet);
    }
  }

  tx.moveCall({
    target: `${environment.launchpadPackageId}::launchpad::activate_launch`,
    typeArguments: [tokenType],
    arguments: [launchObject],
  });

  return { transaction: tx, atomicDevBuyVesting };
}
