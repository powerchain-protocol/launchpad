import { issueChallenge } from "@/lib/server/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const challenge = await issueChallenge(String(body.address || ""), String(body.purpose || ""));
    return Response.json({ challenge });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "CHALLENGE_FAILED" }, { status: 400 });
  }
}
