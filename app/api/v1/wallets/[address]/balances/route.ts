import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { config } from "@/lib/config";
import { isConfiguredAddress } from "@/lib/server/validation";

export async function GET(_: Request, { params }: { params: Promise<{ address: string }> }) {
  try {
    const { address } = await params;
    if (!isConfiguredAddress(address)) throw new Error("INVALID_WALLET");
    const connection = new Connection(config.rpcUrl, "confirmed");
    const owner = new PublicKey(address);
    const [lamports, legacy, token2022] = await Promise.all([
      connection.getBalance(owner, "confirmed"),
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, "confirmed"),
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, "confirmed"),
    ]);
    const tokens = [...legacy.value.map((x) => ({ ...x, program: "SPL Token" })), ...token2022.value.map((x) => ({ ...x, program: "Token-2022" }))]
      .map((entry) => {
        const info = entry.account.data.parsed.info;
        return { tokenAccount: entry.pubkey.toBase58(), mint: String(info.mint), amount: String(info.tokenAmount.amount), decimals: Number(info.tokenAmount.decimals), program: entry.program };
      })
      .filter((token) => BigInt(token.amount) > 0n)
      .map((token) => ({ ...token, symbol: token.mint === config.pwrcMint ? "PWRC" : token.mint === config.usdcMint ? "USDC" : "TOKEN" }));
    return Response.json({ wallet: address, sol: lamports > 0 ? { lamports: String(lamports), decimals: 9, symbol: "SOL" } : null, tokens });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "BALANCE_LOOKUP_FAILED" }, { status: 400 });
  }
}
