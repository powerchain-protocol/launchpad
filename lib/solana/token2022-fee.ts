import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  calculateEpochFee,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedWithFeeInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getTransferFeeConfig,
} from "@solana/spl-token";
import { config } from "@/lib/config";

const BPS = 10_000n;
const REQUIRED_FEE_BPS = 200n;

function exactFee(gross: bigint) {
  return (gross * REQUIRED_FEE_BPS + BPS - 1n) / BPS;
}

export async function inspectPwrcTransferFee(connection: Connection, mintAddress: string, grossAmount?: bigint) {
  const mintKey = new PublicKey(mintAddress);
  const [mint, epochInfo] = await Promise.all([
    getMint(connection, mintKey, "confirmed", TOKEN_2022_PROGRAM_ID),
    connection.getEpochInfo("confirmed"),
  ]);
  const transferFeeConfig = getTransferFeeConfig(mint);
  if (!transferFeeConfig) throw new Error("PWRC_MINT_MISSING_TRANSFER_FEE_CONFIG");
  const epoch = BigInt(epochInfo.epoch);
  const active = epoch >= transferFeeConfig.newerTransferFee.epoch ? transferFeeConfig.newerTransferFee : transferFeeConfig.olderTransferFee;
  if (BigInt(active.transferFeeBasisPoints) !== REQUIRED_FEE_BPS) throw new Error(`PWRC_ACTIVE_TRANSFER_FEE_MUST_BE_200_BPS:${active.transferFeeBasisPoints}`);
  let expectedFee: bigint | undefined;
  if (grossAmount !== undefined) {
    expectedFee = calculateEpochFee(transferFeeConfig, epoch, grossAmount);
    if (expectedFee !== exactFee(grossAmount)) throw new Error("PWRC_TRANSFER_FEE_MAX_CAP_WOULD_REDUCE_2_PERCENT_FEE");
  }
  if (config.pwrcWithdrawAuthority) {
    const authority = transferFeeConfig.withdrawWithheldAuthority?.toBase58?.() || String(transferFeeConfig.withdrawWithheldAuthority || "");
    if (authority !== config.pwrcWithdrawAuthority) throw new Error("PWRC_WITHDRAW_WITHHELD_AUTHORITY_MISMATCH");
  }
  return { mint, mintKey, transferFeeConfig, active, epoch, expectedFee };
}

export async function quotePwrcToken2022Payment(connection: Connection, mintAddress: string, merchantNetAmount: bigint) {
  if (merchantNetAmount <= 0n) throw new Error("AMOUNT_MUST_BE_GREATER_THAN_ZERO");
  const inspected = await inspectPwrcTransferFee(connection, mintAddress);
  let low = merchantNetAmount;
  let high = (merchantNetAmount * BPS + (BPS - REQUIRED_FEE_BPS) - 1n) / (BPS - REQUIRED_FEE_BPS) + 4n;
  while (low < high) {
    const mid = (low + high) / 2n;
    const fee = calculateEpochFee(inspected.transferFeeConfig, inspected.epoch, mid);
    const net = mid - fee;
    if (net >= merchantNetAmount) high = mid;
    else low = mid + 1n;
  }
  const gross = low;
  const fee = calculateEpochFee(inspected.transferFeeConfig, inspected.epoch, gross);
  if (fee !== exactFee(gross)) throw new Error("PWRC_TRANSFER_FEE_MAX_CAP_WOULD_REDUCE_2_PERCENT_FEE");
  const merchantReceives = gross - fee;
  if (merchantReceives !== merchantNetAmount) throw new Error("PWRC_NET_AMOUNT_CANNOT_BE_REPRESENTED_EXACTLY");
  return { gross, fee, merchantReceives, decimals: inspected.mint.decimals };
}

export async function buildPwrcToken2022Payment(args: { connection: Connection; payer: string; merchant: string; mint: string; grossAmount: bigint; recentBlockhash: string }) {
  if (args.grossAmount <= 0n) throw new Error("AMOUNT_MUST_BE_GREATER_THAN_ZERO");
  const inspected = await inspectPwrcTransferFee(args.connection, args.mint, args.grossAmount);
  const { mint, mintKey } = inspected;
  const expectedFee = inspected.expectedFee!;
  const payer = new PublicKey(args.payer);
  const merchant = new PublicKey(args.merchant);
  const source = getAssociatedTokenAddressSync(mintKey, payer, false, TOKEN_2022_PROGRAM_ID);
  const destination = getAssociatedTokenAddressSync(mintKey, merchant, false, TOKEN_2022_PROGRAM_ID);
  const sourceBalance = await args.connection.getTokenAccountBalance(source, "confirmed").catch(() => null);
  if (!sourceBalance || BigInt(sourceBalance.value.amount) < args.grossAmount) throw new Error(!sourceBalance || sourceBalance.value.amount === "0" ? "ZERO_PWRC_BALANCE" : "INSUFFICIENT_PWRC_BALANCE");
  const tx = new Transaction({ feePayer: payer, recentBlockhash: args.recentBlockhash });
  tx.add(createAssociatedTokenAccountIdempotentInstruction(payer, destination, merchant, mintKey, TOKEN_2022_PROGRAM_ID));
  tx.add(createTransferCheckedWithFeeInstruction(source, mintKey, destination, payer, args.grossAmount, mint.decimals, expectedFee, [], TOKEN_2022_PROGRAM_ID));
  return { tx, expectedFee, merchantReceives: args.grossAmount - expectedFee, decimals: mint.decimals };
}
