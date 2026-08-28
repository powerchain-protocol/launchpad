import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { config } from "@/lib/config";

export function isConfiguredAddress(value: string) {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

export function assertOperationalConfig() {
  if (!isConfiguredAddress(config.feeTreasury)) {
    throw new Error("POWERCHAIN_FEE_TREASURY is not configured");
  }
  if (config.serviceFeeBps !== 200) {
    throw new Error("PowerChain platform fee must be 200 bps");
  }
}

export function verifyWalletSignature(address: string, message: string, signature: string) {
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      bs58.decode(signature),
      new PublicKey(address).toBytes(),
    );
  } catch {
    return false;
  }
}

export function isAdmin(address: string) {
  return config.adminWallets.includes(address);
}

export function integerAmount(value: unknown, field = "amount") {
  const text = String(value ?? "");
  if (!/^[0-9]+$/.test(text)) throw new Error(`${field.toUpperCase()}_MUST_BE_INTEGER_BASE_UNITS`);
  const amount = BigInt(text);
  if (amount <= 0n) throw new Error(`${field.toUpperCase()}_MUST_BE_GREATER_THAN_ZERO`);
  return amount;
}
