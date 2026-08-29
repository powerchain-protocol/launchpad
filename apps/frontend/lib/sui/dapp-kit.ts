"use client";

import { createDAppKit } from "@mysten/dapp-kit-react";
import { SuiGrpcClient } from "@mysten/sui/grpc";

const urls = {
  mainnet: process.env.NEXT_PUBLIC_SUI_GRPC_MAINNET_URL ?? "https://fullnode.mainnet.sui.io:443",
  testnet: process.env.NEXT_PUBLIC_SUI_GRPC_TESTNET_URL ?? "https://fullnode.testnet.sui.io:443",
};

export const dAppKit = createDAppKit({
  networks: ["mainnet", "testnet"],
  defaultNetwork: process.env.NEXT_PUBLIC_SUI_NETWORK === "mainnet" ? "mainnet" : "testnet",
  createClient: (network) => new SuiGrpcClient({ network, baseUrl: urls[network] }),
});

declare module "@mysten/dapp-kit-react" {
  interface Register { dAppKit: typeof dAppKit; }
}
