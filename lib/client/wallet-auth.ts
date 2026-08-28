export async function signPurpose(args: { address: string; purpose: string; signMessage: (message: string) => Promise<string> }) {
  const response = await fetch("/api/v1/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: args.address, purpose: args.purpose }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Could not create wallet challenge");
  const signature = await args.signMessage(payload.challenge.message);
  return { challengeId: payload.challenge.id, address: args.address, signature };
}
