import { RPC_HEALTH_TIMEOUT_MS } from "../constants/networks";

export interface RpcHealthResult {
  ok: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
  payload?: unknown;
}

export async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = RPC_HEALTH_TIMEOUT_MS,
): Promise<RpcHealthResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const latencyMs = Math.round(performance.now() - started);
    const text = await response.text();
    let payload: unknown;
    try { payload = text ? JSON.parse(text) : null; } catch {
      return { ok: false, latencyMs, status: response.status, error: "RPC returned malformed JSON." };
    }
    if (!response.ok) return { ok: false, latencyMs, status: response.status, error: `RPC returned HTTP ${response.status}.`, payload };
    return { ok: true, latencyMs, status: response.status, payload };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof DOMException && error.name === "AbortError" ? `RPC check exceeded ${timeoutMs}ms.` : error instanceof Error ? error.message : "RPC request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
