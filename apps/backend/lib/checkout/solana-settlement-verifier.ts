import {
  assertParsedTransactionMatchesIntent,
  type CheckoutIntentTransfer,
  type CheckoutTransactionIntent,
  type ParsedTransactionEffects,
  type SettlementEvidence,
  type SolanaNetwork,
} from "@powerchain/launchpad-domain/checkout";
import {
  Connection,
  PublicKey,
  type ParsedInstruction,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import type { ChainSettlementVerifier } from "./reconciliation";
import type { CheckoutIntentRepository } from "./intent-service";

const MEMO_PROGRAMS = new Set([
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function parsedInstruction(value: ParsedInstruction | PartiallyDecodedInstruction): ParsedInstruction | undefined {
  return "parsed" in value ? value : undefined;
}

export class SolanaSettlementVerifier implements ChainSettlementVerifier {
  constructor(
    public readonly id: string,
    private readonly connection: Connection,
    private readonly intents: CheckoutIntentRepository,
    private readonly network: SolanaNetwork,
    private readonly usdcMint?: string,
  ) {}

  async verify(evidence: SettlementEvidence) {
    if (!evidence.transactionId) return { status: "UNKNOWN" as const, reason: "Order has no submitted transaction id." };
    const intent = await this.intents.getByOrderId(evidence.orderId);
    if (!intent) return { status: "UNKNOWN" as const, transactionId: evidence.transactionId, reason: "Server-authoritative checkout intent is missing." };

    const parsed = await this.connection.getParsedTransaction(evidence.transactionId, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!parsed) {
      const status = await this.connection.getSignatureStatuses([evidence.transactionId], { searchTransactionHistory: true });
      const signatureStatus = status.value[0];
      return signatureStatus
        ? { status: "UNKNOWN" as const, transactionId: evidence.transactionId, reason: "Signature exists but parsed transaction is not yet available." }
        : { status: "ABSENT" as const, transactionId: evidence.transactionId, reason: "Signature is not present in this RPC provider's transaction history." };
    }
    if (parsed.meta?.err) {
      return {
        status: "REJECTED" as const,
        transactionId: evidence.transactionId,
        blockOrCheckpoint: String(parsed.slot),
        reason: `Solana transaction executed with an error: ${JSON.stringify(parsed.meta.err)}`,
      };
    }

    try {
      const effects = await this.parseEffects(parsed, intent);
      assertParsedTransactionMatchesIntent(intent, effects, new Date());
      return {
        status: "SETTLED" as const,
        transactionId: evidence.transactionId,
        blockOrCheckpoint: String(parsed.slot),
      };
    } catch (error) {
      return {
        status: "REJECTED" as const,
        transactionId: evidence.transactionId,
        blockOrCheckpoint: String(parsed.slot),
        reason: error instanceof Error ? error.message : "Transaction effects do not match the checkout intent.",
      };
    }
  }

  private async parseEffects(
    transaction: NonNullable<Awaited<ReturnType<Connection["getParsedTransaction"]>>>,
    intent: CheckoutTransactionIntent,
  ): Promise<ParsedTransactionEffects> {
    const accountKeys = transaction.transaction.message.accountKeys;
    const signer = accountKeys.find((account) => account.signer)?.pubkey.toBase58();
    if (!signer) throw new Error("Submitted Solana transaction has no signer.");

    const instructions: Array<ParsedInstruction | PartiallyDecodedInstruction> = [
      ...transaction.transaction.message.instructions,
      ...(transaction.meta?.innerInstructions?.flatMap((group) => group.instructions) ?? []),
    ];

    const transfers: CheckoutIntentTransfer[] = [];
    let quoteHash: string | undefined;
    for (const instruction of instructions) {
      const programId = instruction.programId.toBase58();
      const parsed = parsedInstruction(instruction);

      if (MEMO_PROGRAMS.has(programId) && parsed) {
        const memo = typeof parsed.parsed === "string" ? parsed.parsed : undefined;
        const match = memo?.match(/(?:POWERCHAIN_QUOTE:)?([a-f0-9]{64})/i);
        if (match?.[1]) quoteHash = match[1].toLowerCase();
        continue;
      }

      if (!parsed || !isRecord(parsed.parsed)) continue;
      const kind = parsed.parsed.type;
      const info = isRecord(parsed.parsed.info) ? parsed.parsed.info : undefined;
      if (!info) continue;

      if (parsed.program === "system" && kind === "transfer") {
        const destination = typeof info.destination === "string" ? info.destination : undefined;
        const lamports = typeof info.lamports === "number" || typeof info.lamports === "string" ? String(info.lamports) : undefined;
        if (destination && lamports) transfers.push({ recipient: destination, asset: "SOL", amountAtomic: lamports });
        continue;
      }

      if ((parsed.program === "spl-token" || programId === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") && (kind === "transferChecked" || kind === "transfer")) {
        const destination = typeof info.destination === "string" ? info.destination : undefined;
        const mint = typeof info.mint === "string" ? info.mint : undefined;
        const tokenAmount = isRecord(info.tokenAmount) ? info.tokenAmount : undefined;
        const amount = typeof tokenAmount?.amount === "string"
          ? tokenAmount.amount
          : typeof info.amount === "string"
            ? info.amount
            : undefined;
        if (!destination || !amount) continue;
        const recipient = await this.resolveTokenAccountOwner(destination);
        const asset = mint && this.usdcMint && new PublicKey(mint).equals(new PublicKey(this.usdcMint)) ? "USDC" : (mint ?? "SPL_TOKEN");
        transfers.push({ recipient, asset, amountAtomic: amount });
      }
    }

    return {
      chain: "solana",
      network: this.network,
      wallet: signer,
      transactionId: transaction.transaction.signatures[0] ?? "",
      transfers,
      ...(quoteHash ? { quoteHash } : {}),
    };
  }

  private async resolveTokenAccountOwner(tokenAccount: string): Promise<string> {
    const response = await this.connection.getParsedAccountInfo(new PublicKey(tokenAccount), "confirmed");
    const data = response.value?.data;
    if (!data || typeof data === "string" || Buffer.isBuffer(data)) return tokenAccount;
    const parsed = isRecord(data.parsed) ? data.parsed : undefined;
    const info = isRecord(parsed?.info) ? parsed.info : undefined;
    return typeof info?.owner === "string" ? info.owner : tokenAccount;
  }
}
