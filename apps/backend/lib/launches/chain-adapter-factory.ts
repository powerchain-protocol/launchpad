import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Connection, PublicKey } from "@solana/web3.js";
import { loadRuntimeConfig } from "@powerchain/launchpad-config";
import {
  SolanaLaunchChainAdapter,
  SuiLaunchChainAdapter,
  type SolanaDevBuyComposer,
  type SolanaGraduationPreviewProvider,
  type SuiGraduationPreviewProvider,
  type SuiTokenPackageProvider,
} from "@powerchain/launchpad-program-client/launch";
import type { SuiDevBuyComposer } from "@powerchain/sui/launch";
import type { LaunchAdapterRegistry } from "@powerchain/launchpad-program-client/launch/adapter";

export interface ProductionLaunchAdapterDependencies {
  suiTokenPackageProvider: SuiTokenPackageProvider;
  solanaDevBuyComposer?: SolanaDevBuyComposer;
  suiDevBuyComposer?: SuiDevBuyComposer;
  solanaGraduationPreviewProvider?: SolanaGraduationPreviewProvider;
  suiGraduationPreviewProvider?: SuiGraduationPreviewProvider;
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required to construct production launch adapters.`);
  return value;
}

export function createProductionLaunchAdapters(
  dependencies: ProductionLaunchAdapterDependencies,
): LaunchAdapterRegistry {
  const config = loadRuntimeConfig();
  const solanaRpc = config.solana.rpcUrls[0];
  const suiGrpc = config.sui.grpcUrls[0];
  if (!solanaRpc) throw new Error("At least one Solana RPC URL is required.");
  if (!suiGrpc) throw new Error("At least one Sui gRPC URL is required.");

  const solana = new SolanaLaunchChainAdapter({
    connection: new Connection(solanaRpc, { commitment: "confirmed" }),
    launchpadProgramId: new PublicKey(required(config.solana.launchpadProgramId, "POWERCHAIN_SOLANA_LAUNCHPAD_PROGRAM_ID")),
    vestingProgramId: new PublicKey(required(config.solana.vestingProgramId, "POWERCHAIN_SOLANA_VESTING_PROGRAM_ID")),
    ...(dependencies.solanaDevBuyComposer ? { devBuyComposer: dependencies.solanaDevBuyComposer } : {}),
    ...(dependencies.solanaGraduationPreviewProvider ? { graduationPreviewProvider: dependencies.solanaGraduationPreviewProvider } : {}),
  });

  const suiClient = new SuiGrpcClient({
    network: config.sui.network,
    baseUrl: suiGrpc,
  });
  const sui = new SuiLaunchChainAdapter({
    client: suiClient,
    environment: {
      launchpadPackageId: required(config.sui.launchpadPackageId, "POWERCHAIN_SUI_LAUNCHPAD_PACKAGE_ID"),
      feeVaultAddress: required(config.sui.feeVault, "POWERCHAIN_SUI_FEE_VAULT"),
      graduationRegistryObjectId: required(config.sui.graduationRegistryObjectId, "POWERCHAIN_SUI_GRADUATION_REGISTRY"),
    },
    tokenPackageProvider: dependencies.suiTokenPackageProvider,
    ...(dependencies.suiDevBuyComposer ? { devBuyComposer: dependencies.suiDevBuyComposer } : {}),
    ...(dependencies.suiGraduationPreviewProvider ? { graduationPreviewProvider: dependencies.suiGraduationPreviewProvider } : {}),
  });

  return { solana, sui };
}
