import { SuiGrpcClient } from "@mysten/sui/grpc";

export class SuiGrpcFallback {
  readonly clients: SuiGrpcClient[];
  constructor(network: "mainnet" | "testnet" | "devnet" | "localnet", urls: string[]) {
    if (!urls.length) throw new Error("At least one Sui gRPC URL is required.");
    this.clients = urls.map((baseUrl) => new SuiGrpcClient({ network, baseUrl }));
  }
  async run<T>(operation: (client: SuiGrpcClient) => Promise<T>): Promise<T> {
    const errors: string[] = [];
    for (const client of this.clients) {
      try { return await operation(client); }
      catch (error) { errors.push(error instanceof Error ? error.message : "Sui gRPC failed"); }
    }
    throw new Error(`All Sui gRPC endpoints failed: ${errors.join(" | ")}`);
  }
}
