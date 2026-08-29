import {
  TOKEN_2022_PROGRAM_ID,
  buildTokenDeployReview,
  validateLaunchDraft,
  type LaunchDraft,
} from "@powerchain/launchpad-domain/launch";
import type { SolanaInstructionPlan } from "./types";

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

export function buildToken2022CreationPlan(
  launch: LaunchDraft & { chain: "solana" },
  mintAddress: string,
): SolanaInstructionPlan {
  validateLaunchDraft(launch);
  if (!mintAddress.trim()) throw new Error("Mint address is required.");

  return {
    payer: launch.creatorWallet,
    mint: mintAddress,
    stage: "TOKEN_DEPLOY",
    requiredSigners: [launch.creatorWallet, mintAddress],
    review: buildTokenDeployReview(launch),
    instructions: [
      {
        programId: SYSTEM_PROGRAM_ID,
        name: "createMintAccount",
        accounts: [launch.creatorWallet, mintAddress],
        data: {
          ownerProgram: TOKEN_2022_PROGRAM_ID,
          extensions: ["MetadataPointer", "TokenMetadata"],
        },
      },
      {
        programId: TOKEN_2022_PROGRAM_ID,
        name: "initializeMetadataPointer",
        accounts: [mintAddress, launch.creatorWallet],
        data: {
          metadataAddress: mintAddress,
          authority: launch.creatorWallet,
        },
      },
      {
        programId: TOKEN_2022_PROGRAM_ID,
        name: "initializeMint",
        accounts: [mintAddress],
        data: {
          decimals: launch.token.decimals,
          mintAuthority: launch.creatorWallet,
          freezeAuthority: "",
        },
      },
      {
        programId: TOKEN_2022_PROGRAM_ID,
        name: "initializeTokenMetadata",
        accounts: [mintAddress, launch.creatorWallet],
        data: {
          name: launch.token.name,
          symbol: launch.token.symbol,
          uri: launch.token.iconUri,
          description: launch.token.description,
        },
      },
    ],
  };
}
