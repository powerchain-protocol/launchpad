import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { BoundCheckoutQuote, CheckoutTransactionIntent } from "@powerchain/launchpad-domain/checkout";

const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export interface SerializedSolanaPaymentPlan { transactionBase64: string; blockhash: string; lastValidBlockHeight: number; transfers: CheckoutTransactionIntent["transfers"] }

export async function serializeSolanaPaymentPlan(input: {
  connection: Connection;
  quote: BoundCheckoutQuote;
  serviceFeeRecipient: string;
  usdcMint?: string;
}): Promise<SerializedSolanaPaymentPlan> {
  if (input.quote.chain !== "solana") throw new Error("Solana payment rail requires a Solana quote.");
  const payer = new PublicKey(input.quote.wallet);
  const treasury = new PublicKey(input.quote.treasuryAddress);
  const feeRecipient = new PublicKey(input.serviceFeeRecipient);
  const transaction = new Transaction();
  const transfers: CheckoutTransactionIntent["transfers"] = [];

  if (input.quote.paymentAsset === "SOL") {
    transaction.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: treasury, lamports: BigInt(input.quote.paymentAmountAtomic) }));
    transfers.push({ recipient: treasury.toBase58(), asset: "SOL", amountAtomic: input.quote.paymentAmountAtomic });
    if (BigInt(input.quote.serviceFeeAtomic) > 0n) {
      transaction.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: feeRecipient, lamports: BigInt(input.quote.serviceFeeAtomic) }));
      transfers.push({ recipient: feeRecipient.toBase58(), asset: "SOL", amountAtomic: input.quote.serviceFeeAtomic });
    }
  } else if (input.quote.paymentAsset === "USDC") {
    if (!input.usdcMint) throw new Error("USDC mint is not configured for this Solana network.");
    const mint = new PublicKey(input.usdcMint);
    const source = getAssociatedTokenAddressSync(mint, payer, false, TOKEN_PROGRAM_ID);
    const treasuryAta = getAssociatedTokenAddressSync(mint, treasury, true, TOKEN_PROGRAM_ID);
    const feeAta = getAssociatedTokenAddressSync(mint, feeRecipient, true, TOKEN_PROGRAM_ID);
    transaction.add(createAssociatedTokenAccountIdempotentInstruction(payer, treasuryAta, treasury, mint, TOKEN_PROGRAM_ID));
    transaction.add(createTransferCheckedInstruction(source, mint, treasuryAta, payer, BigInt(input.quote.paymentAmountAtomic), 6, [], TOKEN_PROGRAM_ID));
    transfers.push({ recipient: treasury.toBase58(), asset: "USDC", amountAtomic: input.quote.paymentAmountAtomic });
    if (BigInt(input.quote.serviceFeeAtomic) > 0n) {
      transaction.add(createAssociatedTokenAccountIdempotentInstruction(payer, feeAta, feeRecipient, mint, TOKEN_PROGRAM_ID));
      transaction.add(createTransferCheckedInstruction(source, mint, feeAta, payer, BigInt(input.quote.serviceFeeAtomic), 6, [], TOKEN_PROGRAM_ID));
      transfers.push({ recipient: feeRecipient.toBase58(), asset: "USDC", amountAtomic: input.quote.serviceFeeAtomic });
    }
  } else {
    throw new Error(`Unsupported Solana checkout asset: ${input.quote.paymentAsset}`);
  }

  transaction.add(new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(`POWERCHAIN_QUOTE:${input.quote.quoteHash}`, "utf8") }));
  const latest = await input.connection.getLatestBlockhash("confirmed");
  transaction.feePayer = payer;
  transaction.recentBlockhash = latest.blockhash;
  const transactionBase64 = transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
  return { transactionBase64, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight, transfers };
}
