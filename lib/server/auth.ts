import crypto from "node:crypto";
import { config } from "@/lib/config";
import { consumeChallenge, createChallenge, getChallenge } from "@/lib/server/store";
import { isAdmin, isConfiguredAddress, verifyWalletSignature } from "@/lib/server/validation";
import type { AuthChallenge } from "@/types/domain";

export async function issueChallenge(address: string, purpose: string) {
  if (!isConfiguredAddress(address)) throw new Error("INVALID_WALLET");
  if (!purpose || purpose.length > 80) throw new Error("INVALID_PURPOSE");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 180_000);
  const nonce = crypto.randomBytes(24).toString("hex");
  const id = crypto.randomUUID();
  const message = [
    "PowerChain Wallet Authorization",
    `Domain: ${new URL(config.appUrl).host}`,
    `Wallet: ${address}`,
    `Purpose: ${purpose}`,
    `Nonce: ${nonce}`,
    `Issued At: ${createdAt.toISOString()}`,
    `Expires At: ${expiresAt.toISOString()}`,
  ].join("\n");
  const challenge: AuthChallenge = { id, address, purpose, nonce, message, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() };
  return createChallenge(challenge);
}

export async function consumeSignedChallenge(input: { challengeId: string; address: string; purpose: string; signature: string; admin?: boolean }) {
  const challenge = await getChallenge(input.challengeId);
  if (!challenge) throw new Error("CHALLENGE_NOT_FOUND");
  if (challenge.consumedAt) throw new Error("CHALLENGE_ALREADY_USED");
  if (Date.parse(challenge.expiresAt) <= Date.now()) throw new Error("CHALLENGE_EXPIRED");
  if (challenge.address !== input.address || challenge.purpose !== input.purpose) throw new Error("CHALLENGE_BINDING_MISMATCH");
  if (input.admin && !isAdmin(input.address)) throw new Error("ADMIN_WALLET_REQUIRED");
  if (!verifyWalletSignature(input.address, challenge.message, input.signature)) throw new Error("INVALID_SIGNATURE");
  const consumed = await consumeChallenge(challenge.id);
  if (!consumed) throw new Error("CHALLENGE_ALREADY_USED");
  return consumed;
}
