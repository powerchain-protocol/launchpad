import { consumeSignedChallenge } from "@/lib/server/auth";
import { addAudit, listTx } from "@/lib/server/store";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    await consumeSignedChallenge({ challengeId: String(body.challengeId || ""), address: String(body.address || ""), purpose: "admin:transactions:read", signature: String(body.signature || ""), admin: true });
    await addAudit(String(body.address), "admin.transactions.read");
    const all = await listTx();
    return Response.json({ transactions: all.filter((x) => x.status === "VALIDATED") });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "UNAUTHORIZED" }, { status: 401 });
  }
}
