import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { PublicKey } from "@solana/web3.js";
import {
  canonicalize,
  type GraduationAdapterSelection,
  type LaunchDraft,
  type VestingTemplate,
} from "@powerchain/launchpad-domain/launch";

class Writer {
  private readonly chunks: Uint8Array[] = [];
  u8(value: number) { this.chunks.push(Uint8Array.of(value)); }
  bool(value: boolean) { this.u8(value ? 1 : 0); }
  u16(value: number) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, value, true); this.chunks.push(b); }
  u32(value: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, value, true); this.chunks.push(b); }
  u64(value: bigint) { this.integer64(value, false); }
  i64(value: bigint) { this.integer64(value, true); }
  private integer64(value: bigint, signed: boolean) {
    const b = new Uint8Array(8);
    const view = new DataView(b.buffer);
    if (signed) view.setBigInt64(0, value, true);
    else view.setBigUint64(0, value, true);
    this.chunks.push(b);
  }
  fixed(value: Uint8Array, length: number) {
    if (value.length !== length) throw new Error(`Expected ${length} bytes; got ${value.length}.`);
    this.chunks.push(value);
  }
  pubkey(value: string | PublicKey) { this.fixed(new PublicKey(value).toBytes(), 32); }
  vec<T>(values: T[], encode: (writer: Writer, value: T) => void) {
    this.u32(values.length);
    for (const value of values) encode(this, value);
  }
  finish(): Uint8Array {
    const length = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of this.chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  }
}

export function anchorDiscriminator(namespace: "global" | "account" | "event", name: string): Uint8Array {
  return sha256(utf8ToBytes(`${namespace}:${name}`)).slice(0, 8);
}

export function sha256Bytes(value: string): Uint8Array { return sha256(utf8ToBytes(value)); }
export function hashOrHex(value: string): Uint8Array {
  if (/^[a-f0-9]{64}$/i.test(value)) return Uint8Array.from(value.match(/../g)!.map((pair) => Number.parseInt(pair, 16)));
  return sha256Bytes(value);
}
export function zero32(): Uint8Array { return new Uint8Array(32); }

const venueCode = (venue: string) => venue === "raydium" ? 0 : venue === "meteora" ? 1 : venue === "orca" ? 2 : (() => { throw new Error(`Unsupported Solana venue: ${venue}`); })();
const eligibilityCode = (mode: string) => mode === "public" ? 0 : mode === "allowlist" ? 1 : mode === "private" ? 2 : (() => { throw new Error(`Unsupported eligibility mode: ${mode}`); })();
const unixSeconds = (value?: string) => value ? BigInt(Math.floor(Date.parse(value) / 1_000)) : 0n;

export const SOLANA_INITIALIZE_LAUNCH_FIELDS = [
  "venue", "adapterVersion", "adapterIdHash", "adapterConfigHash", "reviewHash",
  "initialPriceAtomic", "graduationThresholdAtomic", "antiBotDelaySeconds",
  "maxInitialPurchasePerWalletAtomic", "opensAt", "closesAt", "eligibilityMode",
  "eligibilityPolicyHash", "eligibilityCommitment", "devBuyEnabled",
  "devBuyAmountAtomic", "devBuyPaymentAssetHash", "devVestingEnabled",
  "devVestingTemplateHash", "payouts",
] as const;

export function encodeInitializeLaunch(
  launch: LaunchDraft & { chain: "solana" },
  adapter: GraduationAdapterSelection,
  reviewHash: string,
): Uint8Array {
  if (!adapter.configHash) throw new Error("Graduation adapter configHash is required.");
  const eligibility = launch.eligibility ?? { mode: "public" as const };
  const devBuy = launch.devBuy?.enabled ? launch.devBuy : undefined;
  const devVesting = devBuy?.vesting?.enabled ? devBuy.vesting : undefined;
  const writer = new Writer();
  writer.fixed(anchorDiscriminator("global", "initialize_launch"), 8);
  writer.u8(venueCode(launch.graduation.venue));
  writer.u32(adapter.version);
  writer.fixed(sha256Bytes(adapter.adapterId), 32);
  writer.fixed(hashOrHex(adapter.configHash), 32);
  writer.fixed(hashOrHex(reviewHash), 32);
  writer.u64(BigInt(launch.curve.initialPriceAtomic));
  writer.u64(BigInt(launch.curve.graduationThresholdAtomic));
  writer.u32(launch.antiBot.enabled ? launch.antiBot.delaySeconds : 0);
  writer.u64(BigInt(launch.initialPurchaseLimit?.enabled ? launch.initialPurchaseLimit.maxPerWalletAtomic! : "0"));
  writer.i64(launch.launchWindow?.enabled ? unixSeconds(launch.launchWindow.opensAt) : 0n);
  writer.i64(launch.launchWindow?.enabled ? unixSeconds(launch.launchWindow.closesAt) : 0n);
  writer.u8(eligibilityCode(eligibility.mode));
  writer.fixed(eligibility.mode === "public" ? zero32() : sha256Bytes(eligibility.policyId ?? ""), 32);
  writer.fixed(eligibility.mode === "public" ? zero32() : hashOrHex(eligibility.commitment ?? ""), 32);
  writer.bool(Boolean(devBuy));
  writer.u64(BigInt(devBuy?.amountAtomic ?? "0"));
  writer.fixed(devBuy ? sha256Bytes(devBuy.paymentAsset) : zero32(), 32);
  writer.bool(Boolean(devVesting));
  writer.fixed(devVesting ? sha256Bytes(canonicalize(devVesting.template)) : zero32(), 32);
  writer.vec(launch.payoutSplits, (w, payout) => { w.pubkey(payout.recipient); w.u16(payout.basisPoints); });
  return writer.finish();
}

export const SOLANA_INITIALIZE_VESTING_FIELDS = [
  "scheduleId", "kind", "startAt", "cliffSeconds", "durationSeconds", "depositAmount", "tranches",
] as const;

export function encodeInitializeVesting(
  scheduleId: Uint8Array,
  template: VestingTemplate,
  depositAmount: bigint,
): Uint8Array {
  const writer = new Writer();
  writer.fixed(anchorDiscriminator("global", "initialize_vesting"), 8);
  writer.fixed(scheduleId, 32);
  writer.u8(template.schedule.kind === "linear" ? 0 : 1);
  writer.i64(0n);
  writer.u64(BigInt(template.schedule.kind === "linear" ? template.schedule.cliffSeconds : 0));
  writer.u64(BigInt(template.schedule.kind === "linear" ? template.schedule.durationSeconds : 0));
  writer.u64(depositAmount);
  const tranches = template.schedule.kind === "progressive" ? template.schedule.tranches : [];
  writer.vec(tranches, (w, tranche) => { w.u64(BigInt(tranche.unlockOffsetSeconds)); w.u16(tranche.basisPoints); });
  return writer.finish();
}

export interface DecodedLaunchAccountCore {
  creator: PublicKey;
  mint: PublicKey;
  registry: PublicKey;
  adapterEntry: PublicKey;
  venue: number;
  adapterVersion: number;
  adapterIdHash: Uint8Array;
  adapterConfigHash: Uint8Array;
  reviewHash: Uint8Array;
}

export function decodeLaunchAccountCore(data: Uint8Array): DecodedLaunchAccountCore {
  const discriminator = anchorDiscriminator("account", "Launch");
  if (data.length < 237 || !discriminator.every((value, index) => data[index] === value)) {
    throw new Error("Invalid PowerChain Launch account discriminator or length.");
  }
  let offset = 8;
  const take = (length: number) => { const value = data.slice(offset, offset + length); offset += length; return value; };
  const creator = new PublicKey(take(32));
  const mint = new PublicKey(take(32));
  const registry = new PublicKey(take(32));
  const adapterEntry = new PublicKey(take(32));
  const venue = take(1)[0]!;
  const adapterVersion = new DataView(take(4).buffer).getUint32(0, true);
  const adapterIdHash = take(32);
  const adapterConfigHash = take(32);
  const reviewHash = take(32);
  return { creator, mint, registry, adapterEntry, venue, adapterVersion, adapterIdHash, adapterConfigHash, reviewHash };
}

export const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
