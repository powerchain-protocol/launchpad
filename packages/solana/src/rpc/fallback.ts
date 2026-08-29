import { Connection, type Commitment } from "@solana/web3.js";

export class SolanaRpcFallback {
  readonly connections: Connection[];
  constructor(urls: string[], commitment: Commitment = "confirmed") {
    if (!urls.length) throw new Error("At least one Solana RPC URL is required.");
    this.connections = urls.map((url) => new Connection(url, { commitment }));
  }

  async run<T>(operation: (connection: Connection) => Promise<T>): Promise<T> {
    const errors: string[] = [];
    for (const connection of this.connections) {
      try { return await operation(connection); }
      catch (error) { errors.push(error instanceof Error ? error.message : "RPC failed"); }
    }
    throw new Error(`All Solana RPC endpoints failed: ${errors.join(" | ")}`);
  }
}
