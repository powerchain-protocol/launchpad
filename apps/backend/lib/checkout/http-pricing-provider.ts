import { AppError } from "@powerchain/launchpad-shared";
import type { QuotePricingProvider, QuotePricingRequest, QuotePricingResult } from "./pricing";

export interface HttpQuotePricingProviderOptions {
  url: string;
  bearerToken?: string;
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export class HttpQuotePricingProvider implements QuotePricingProvider {
  private readonly timeoutMs: number;

  constructor(private readonly options: HttpQuotePricingProviderOptions) {
    this.timeoutMs = options.timeoutMs ?? 8_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 30_000) {
      throw new Error("Pricing timeout must be an integer from 1 to 30,000 ms.");
    }
  }

  async quote(input: QuotePricingRequest): Promise<QuotePricingResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.options.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          ...(this.options.bearerToken ? { authorization: `Bearer ${this.options.bearerToken}` } : {}),
        },
        body: JSON.stringify(input),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        throw new AppError("SERVICE_UNAVAILABLE", `Pricing provider returned HTTP ${response.status}.`, 503);
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AppError("SERVICE_UNAVAILABLE", "Pricing provider returned malformed JSON.", 503);
      }
      if (!isRecord(payload)) throw new AppError("SERVICE_UNAVAILABLE", "Pricing provider response is invalid.", 503);
      const receiveAmountAtomic = payload.receiveAmountAtomic;
      const source = payload.source;
      const observedAt = payload.observedAt;
      if (typeof receiveAmountAtomic !== "string" || !/^\d+$/.test(receiveAmountAtomic) || BigInt(receiveAmountAtomic) <= 0n) {
        throw new AppError("SERVICE_UNAVAILABLE", "Pricing provider returned an invalid receive amount.", 503);
      }
      if (typeof source !== "string" || !source.trim()) {
        throw new AppError("SERVICE_UNAVAILABLE", "Pricing provider source is missing.", 503);
      }
      if (typeof observedAt !== "string" || !Number.isFinite(Date.parse(observedAt))) {
        throw new AppError("SERVICE_UNAVAILABLE", "Pricing provider timestamp is invalid.", 503);
      }
      return { receiveAmountAtomic, source, observedAt };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AppError("SERVICE_UNAVAILABLE", "Pricing provider timed out.", 503);
      }
      throw new AppError("SERVICE_UNAVAILABLE", error instanceof Error ? error.message : "Pricing provider request failed.", 503);
    } finally {
      clearTimeout(timeout);
    }
  }
}
