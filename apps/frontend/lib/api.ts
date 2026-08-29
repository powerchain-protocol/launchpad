export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = "API_ERROR",
    public readonly requestId?: string,
  ) { super(message); this.name = "ApiClientError"; }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const requestId = response.headers.get("x-request-id") ?? undefined;
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch {
    throw new ApiClientError(`API returned malformed JSON (HTTP ${response.status}).`, response.status, "MALFORMED_RESPONSE", requestId);
  }
  if (!response.ok) {
    const candidate = payload as { error?: { message?: string; code?: string } };
    throw new ApiClientError(candidate.error?.message ?? `Request failed with HTTP ${response.status}.`, response.status, candidate.error?.code ?? "API_ERROR", requestId);
  }
  if (payload && typeof payload === "object" && "data" in payload) return (payload as { data: T }).data;
  return payload as T;
}
