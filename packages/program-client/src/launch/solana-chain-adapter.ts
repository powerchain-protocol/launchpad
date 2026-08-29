import {
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  ExtensionType,
  getMint,
  getMintLen,
  getTokenMetadata,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
} from "@solana/spl-token";
import { createInitializeInstruction, pack } from "@solana/spl-token-metadata";
import {
  AddressLookupTableAccount,
  Commitment,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import {
  buildLaunchConfigureReview,
  buildTokenDeployReview,
  type GraduationAdapterSelection,
  type GraduationPreview,
  type LaunchDraft,
  type LaunchRecord,
  type LaunchSimulationResult,
  type PreparedTransaction,
  type VerificationResult,
} from "@powerchain/launchpad-domain/launch";
import type { LaunchChainAdapter, LaunchConfigurationPreparationContext } from "./adapter";
import {
  bytesToHex,
  decodeLaunchAccountCore,
  encodeInitializeLaunch,
  encodeInitializeVesting,
} from "../solana/codec";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const MAX_SOLANA_PACKET = 1232;

export interface SolanaDevBuyCompositionResult {
  instructions: TransactionInstruction[];
  purchasedTokenAccount: PublicKey;
  purchasedAmountAtomic: bigint;
}
export interface SolanaDevBuyComposer {
  compose(input: {
    launch: LaunchRecord & { chain: "solana" };
    mint: PublicKey;
    launchPda: PublicKey;
    adapter: GraduationAdapterSelection;
  }): Promise<SolanaDevBuyCompositionResult>;
}
export interface SolanaGraduationPreviewProvider {
  preview(launch: LaunchRecord & { chain: "solana" }, adapter: GraduationAdapterSelection): Promise<GraduationPreview>;
}

export interface SolanaLaunchChainAdapterOptions {
  connection: Connection;
  launchpadProgramId: PublicKey | string;
  vestingProgramId: PublicKey | string;
  commitment?: Commitment;
  lookupTables?: AddressLookupTableAccount[];
  devBuyComposer?: SolanaDevBuyComposer;
  graduationPreviewProvider?: SolanaGraduationPreviewProvider;
}

export class SolanaLaunchChainAdapter implements LaunchChainAdapter {
  private readonly connection: Connection;
  private readonly launchpadProgramId: PublicKey;
  private readonly vestingProgramId: PublicKey;
  private readonly commitment: Commitment;
  private readonly lookupTables: AddressLookupTableAccount[];

  constructor(private readonly options: SolanaLaunchChainAdapterOptions) {
    this.connection = options.connection;
    this.launchpadProgramId = new PublicKey(options.launchpadProgramId);
    this.vestingProgramId = new PublicKey(options.vestingProgramId);
    this.commitment = options.commitment ?? "confirmed";
    this.lookupTables = options.lookupTables ?? [];
    if (this.launchpadProgramId.equals(SystemProgram.programId) || this.vestingProgramId.equals(SystemProgram.programId)) {
      throw new Error("Production program IDs cannot use the system-program placeholder.");
    }
  }

  async prepareTokenDeployment(launch: LaunchDraft): Promise<PreparedTransaction> {
    if (launch.chain !== "solana") throw new Error("Solana adapter received a non-Solana launch.");
    const creator = new PublicKey(launch.creatorWallet);
    const mint = Keypair.generate();
    const metadata = {
      updateAuthority: creator,
      mint: mint.publicKey,
      name: launch.token.name,
      symbol: launch.token.symbol,
      uri: launch.token.iconUri,
      additionalMetadata: [["description", launch.token.description]] as [string, string][],
    };
    const mintLen = getMintLen([ExtensionType.MetadataPointer]);
    const space = mintLen + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
    const lamports = await this.connection.getMinimumBalanceForRentExemption(space, this.commitment);
    const instructions: TransactionInstruction[] = [
      SystemProgram.createAccount({ fromPubkey: creator, newAccountPubkey: mint.publicKey, lamports, space, programId: TOKEN_2022_PROGRAM_ID }),
      createInitializeMetadataPointerInstruction(mint.publicKey, creator, mint.publicKey, TOKEN_2022_PROGRAM_ID),
      createInitializeMintInstruction(mint.publicKey, launch.token.decimals, creator, null, TOKEN_2022_PROGRAM_ID),
      createInitializeInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint.publicKey,
        updateAuthority: creator,
        mint: mint.publicKey,
        mintAuthority: creator,
        name: launch.token.name,
        symbol: launch.token.symbol,
        uri: launch.token.iconUri,
      }),
      new TransactionInstruction({
        programId: MEMO_PROGRAM_ID,
        keys: [],
        data: Buffer.from(`POWERCHAIN_LAUNCH_TOKEN:${launch.id}:${mint.publicKey.toBase58()}`, "utf8"),
      }),
    ];
    const { blockhash } = await this.connection.getLatestBlockhash(this.commitment);
    const message = new TransactionMessage({ payerKey: creator, recentBlockhash: blockhash, instructions }).compileToV0Message(this.lookupTables);
    const tx = new VersionedTransaction(message);
    tx.sign([mint]);
    const serialized = tx.serialize();
    this.assertPacketSize(serialized.length, "Token deployment");
    const review = buildTokenDeployReview(launch);
    review.instructions.push({ index: review.instructions.length, program: "SPL Memo", action: "Bind launch id to mint", accounts: [mint.publicKey.toBase58()] });
    return { launchId: launch.id, chain: "solana", stage: "TOKEN_DEPLOY", serialized: Buffer.from(serialized).toString("base64"), encoding: "base64", review };
  }

  async verifyTokenDeployment(launch: LaunchRecord, transactionId: string): Promise<VerificationResult> {
    if (launch.chain !== "solana") return this.notVerified(launch, "TOKEN_DEPLOY", transactionId, "Wrong chain adapter.");
    const parsed = await this.connection.getParsedTransaction(transactionId, { commitment: this.commitment, maxSupportedTransactionVersion: 0 });
    if (!parsed || parsed.meta?.err) return this.notVerified(launch, "TOKEN_DEPLOY", transactionId, "Deployment transaction is absent or failed.");
    const prefix = `POWERCHAIN_LAUNCH_TOKEN:${launch.id}:`;
    let mintAddress: string | undefined;
    for (const instruction of parsed.transaction.message.instructions) {
      if ("parsed" in instruction && typeof instruction.parsed === "string" && instruction.parsed.startsWith(prefix)) {
        mintAddress = instruction.parsed.slice(prefix.length);
      }
    }
    if (!mintAddress) return this.notVerified(launch, "TOKEN_DEPLOY", transactionId, "PowerChain launch/mint commitment memo not found.");
    const mintKey = new PublicKey(mintAddress);
    const info = await this.connection.getAccountInfo(mintKey, this.commitment);
    if (!info || !info.owner.equals(TOKEN_2022_PROGRAM_ID)) return this.notVerified(launch, "TOKEN_DEPLOY", transactionId, "Mint is not owned by Token-2022.");
    const mint = await getMint(this.connection, mintKey, this.commitment, TOKEN_2022_PROGRAM_ID);
    if (mint.decimals !== launch.token.decimals || !mint.mintAuthority?.equals(new PublicKey(launch.creatorWallet))) {
      return this.notVerified(launch, "TOKEN_DEPLOY", transactionId, "Mint decimals or authority do not match the reviewed launch.");
    }
    const metadata = await getTokenMetadata(this.connection, mintKey, this.commitment, TOKEN_2022_PROGRAM_ID);
    if (!metadata || metadata.name !== launch.token.name || metadata.symbol !== launch.token.symbol || metadata.uri !== launch.token.iconUri) {
      return this.notVerified(launch, "TOKEN_DEPLOY", transactionId, "Token metadata does not match the reviewed launch.");
    }
    return { verified: true, transactionId, chain: "solana", stage: "TOKEN_DEPLOY", tokenAddress: mintAddress, blockOrCheckpoint: String(parsed.slot) };
  }

  async prepareLaunchConfiguration(launch: LaunchRecord, context: LaunchConfigurationPreparationContext): Promise<PreparedTransaction> {
    if (launch.chain !== "solana") throw new Error("Solana adapter received a non-Solana launch.");
    const tx = await this.buildConfigurationTransaction(launch, context);
    const serialized = tx.serialize();
    this.assertPacketSize(serialized.length, "Launch configuration");
    return {
      launchId: launch.id,
      chain: "solana",
      stage: "LAUNCH_CONFIG",
      serialized: Buffer.from(serialized).toString("base64"),
      encoding: "base64",
      review: buildLaunchConfigureReview(launch, { adapter: context.graduationAdapter, configurationHash: context.reviewHash }),
    };
  }

  async simulateLaunchConfiguration(launch: LaunchRecord, context: LaunchConfigurationPreparationContext): Promise<LaunchSimulationResult> {
    if (launch.chain !== "solana") throw new Error("Solana adapter received a non-Solana launch.");
    const tx = await this.buildConfigurationTransaction(launch, context);
    const simulation = await this.connection.simulateTransaction(tx, { sigVerify: false });
    const fee = await this.connection.getFeeForMessage(tx.message, this.commitment);
    return {
      launchId: launch.id,
      chain: "solana",
      stage: "LAUNCH_CONFIG",
      configurationHash: context.reviewHash,
      expectedEffects: this.expectedEffects(launch, context.graduationAdapter),
      chainSimulation: {
        success: simulation.value.err == null,
        ...(fee.value == null ? {} : { estimatedNetworkFeeAtomic: String(fee.value) }),
        ...(simulation.value.unitsConsumed == null ? {} : { computeOrGasUsed: String(simulation.value.unitsConsumed) }),
        ...(simulation.value.logs ? { logs: simulation.value.logs } : {}),
        ...(simulation.value.err == null ? {} : { error: JSON.stringify(simulation.value.err) }),
      },
      warnings: launch.devBuy?.enabled && !this.options.devBuyComposer ? ["Dev-buy composer is not configured."] : [],
      simulatedAt: new Date().toISOString(),
    };
  }

  async verifyLaunchConfiguration(launch: LaunchRecord, transactionId: string): Promise<VerificationResult> {
    if (launch.chain !== "solana") return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Wrong chain adapter.");
    if (!launch.tokenAddress) return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Launch has no verified Token-2022 mint.");
    const status = await this.connection.getSignatureStatus(transactionId, { searchTransactionHistory: true });
    if (!status.value || status.value.err) return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Configuration transaction is absent or failed.");
    const mint = new PublicKey(launch.tokenAddress);
    const [launchPda] = PublicKey.findProgramAddressSync([Buffer.from("launch"), mint.toBuffer()], this.launchpadProgramId);
    const info = await this.connection.getAccountInfo(launchPda, this.commitment);
    if (!info || !info.owner.equals(this.launchpadProgramId)) return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Launch PDA is missing or has the wrong owner.");
    const decoded = decodeLaunchAccountCore(info.data);
    if (!decoded.creator.equals(new PublicKey(launch.creatorWallet)) || !decoded.mint.equals(mint)) {
      return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "On-chain launch creator or mint does not match.");
    }
    if (launch.graduationAdapter) {
      if (decoded.adapterVersion !== launch.graduationAdapter.version || bytesToHex(decoded.adapterIdHash) !== bytesToHex(sha256(utf8ToBytes(launch.graduationAdapter.adapterId)))) {
        return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "On-chain graduation adapter does not match the governed review.");
      }
    }
    const reviewHash = bytesToHex(decoded.reviewHash);
    let vestingAddress: string | undefined;
    if (launch.devBuy?.enabled && launch.devBuy.vesting?.enabled) {
      const scheduleId = sha256(utf8ToBytes(`powerchain:${launch.id}:dev-buy-vesting`));
      const [schedule] = PublicKey.findProgramAddressSync([Buffer.from("vesting"), mint.toBuffer(), new PublicKey(launch.creatorWallet).toBuffer(), Buffer.from(scheduleId)], this.vestingProgramId);
      const scheduleInfo = await this.connection.getAccountInfo(schedule, this.commitment);
      if (!scheduleInfo || !scheduleInfo.owner.equals(this.vestingProgramId)) return this.notVerified(launch, "LAUNCH_CONFIG", transactionId, "Expected dev-buy vesting schedule was not created atomically.");
      vestingAddress = schedule.toBase58();
    }
    return { verified: true, transactionId, chain: "solana", stage: "LAUNCH_CONFIG", reviewHash, ...(vestingAddress ? { vestingAddress } : {}) };
  }

  async previewGraduation(launch: LaunchRecord, adapter: GraduationAdapterSelection): Promise<GraduationPreview> {
    if (launch.chain !== "solana") throw new Error("Solana adapter received a non-Solana launch.");
    if (this.options.graduationPreviewProvider) return this.options.graduationPreviewProvider.preview(launch, adapter);
    return {
      launchId: launch.id,
      chain: "solana",
      venue: launch.graduation.venue,
      adapter,
      poolParameters: [
        { key: "adapterVersion", value: String(adapter.version), source: "adapter" },
        { key: "graduationThresholdAtomic", value: launch.curve.graduationThresholdAtomic, source: "creator" },
      ],
      assumptions: ["Venue-specific liquidity estimates require the governed graduation adapter preview provider."],
      warnings: ["No venue preview provider is configured; no liquidity estimate is fabricated."],
      observedAt: new Date().toISOString(),
    };
  }

  private async buildConfigurationTransaction(launch: LaunchRecord & { chain: "solana" }, context: LaunchConfigurationPreparationContext): Promise<VersionedTransaction> {
    if (!launch.tokenAddress) throw new Error("A verified Token-2022 mint is required before Tx 2.");
    if (!context.graduationAdapter.configHash) throw new Error("Governed graduation adapter configHash is required.");
    const creator = new PublicKey(launch.creatorWallet);
    const mint = new PublicKey(launch.tokenAddress);
    const [registry] = PublicKey.findProgramAddressSync([Buffer.from("adapter-registry")], this.launchpadProgramId);
    if (context.graduationAdapter.registryId !== registry.toBase58()) {
      throw new Error("Governed adapter registryId does not match the launchpad registry PDA.");
    }
    const venue = launch.graduation.venue === "raydium" ? 0 : launch.graduation.venue === "meteora" ? 1 : 2;
    const version = Buffer.alloc(4); version.writeUInt32LE(context.graduationAdapter.version);
    const [adapterEntry] = PublicKey.findProgramAddressSync([Buffer.from("adapter"), registry.toBuffer(), Buffer.from([venue]), version], this.launchpadProgramId);
    if (context.graduationAdapter.registryEntryAddress && context.graduationAdapter.registryEntryAddress !== adapterEntry.toBase58()) {
      throw new Error("Governed adapter entry address does not match the expected PDA.");
    }
    const [launchPda] = PublicKey.findProgramAddressSync([Buffer.from("launch"), mint.toBuffer()], this.launchpadProgramId);
    const instructions: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
      new TransactionInstruction({
        programId: this.launchpadProgramId,
        keys: [
          { pubkey: creator, isSigner: true, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: registry, isSigner: false, isWritable: false },
          { pubkey: adapterEntry, isSigner: false, isWritable: false },
          { pubkey: launchPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(encodeInitializeLaunch(launch, context.graduationAdapter, context.reviewHash)),
      }),
    ];

    if (launch.devBuy?.enabled) {
      if (!this.options.devBuyComposer) throw new Error("Solana dev-buy is enabled but no governed dev-buy composer is configured.");
      const composed = await this.options.devBuyComposer.compose({ launch, mint, launchPda, adapter: context.graduationAdapter });
      instructions.push(...composed.instructions);
      if (launch.devBuy.vesting?.enabled) {
        if (composed.purchasedAmountAtomic <= 0n) throw new Error("Dev-buy composer returned a non-positive purchased token amount.");
        const scheduleId = sha256(utf8ToBytes(`powerchain:${launch.id}:dev-buy-vesting`));
        const [schedule] = PublicKey.findProgramAddressSync([Buffer.from("vesting"), mint.toBuffer(), creator.toBuffer(), Buffer.from(scheduleId)], this.vestingProgramId);
        const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vesting-vault"), schedule.toBuffer()], this.vestingProgramId);
        instructions.push(new TransactionInstruction({
          programId: this.vestingProgramId,
          keys: [
            { pubkey: creator, isSigner: true, isWritable: true },
            { pubkey: creator, isSigner: false, isWritable: false },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: composed.purchasedTokenAccount, isSigner: false, isWritable: true },
            { pubkey: schedule, isSigner: false, isWritable: true },
            { pubkey: vault, isSigner: false, isWritable: true },
            { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: Buffer.from(encodeInitializeVesting(scheduleId, launch.devBuy.vesting.template, composed.purchasedAmountAtomic)),
        }));
      }
    }

    const { blockhash } = await this.connection.getLatestBlockhash(this.commitment);
    const message = new TransactionMessage({ payerKey: creator, recentBlockhash: blockhash, instructions }).compileToV0Message(this.lookupTables);
    return new VersionedTransaction(message);
  }

  private expectedEffects(launch: LaunchRecord & { chain: "solana" }, adapter: GraduationAdapterSelection) {
    const devBuy = launch.devBuy?.enabled ? launch.devBuy : undefined;
    return {
      graduationVenue: launch.graduation.venue,
      graduationAdapter: adapter,
      payoutRecipients: launch.payoutSplits.length,
      antiBotDelaySeconds: launch.antiBot.enabled ? launch.antiBot.delaySeconds : 0,
      ...(launch.launchWindow ? { launchWindow: launch.launchWindow } : {}),
      ...(launch.initialPurchaseLimit ? { initialPurchaseLimit: launch.initialPurchaseLimit } : {}),
      ...(launch.eligibility ? { eligibility: launch.eligibility } : {}),
      ...(devBuy ? { devBuy: { enabled: true, amountAtomic: devBuy.amountAtomic, paymentAsset: devBuy.paymentAsset, routedToVesting: Boolean(devBuy.vesting?.enabled), ...(devBuy.vesting?.enabled ? { vestingTemplate: devBuy.vesting.template } : {}) } } : {}),
    };
  }

  private assertPacketSize(length: number, label: string): void {
    if (length > MAX_SOLANA_PACKET) throw new Error(`${label} transaction is ${length} bytes and exceeds Solana's ${MAX_SOLANA_PACKET}-byte packet limit. Configure address lookup tables or reduce instruction inputs.`);
  }

  private notVerified(launch: LaunchDraft, stage: "TOKEN_DEPLOY" | "LAUNCH_CONFIG", transactionId: string, reason: string): VerificationResult {
    return { verified: false, transactionId, chain: launch.chain, stage, reason };
  }
}
