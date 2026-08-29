import { AppError } from "@powerchain/launchpad-shared";

export interface D1LikeStatement {
  bind(...values: unknown[]): D1LikeStatement;
  first<T = unknown>(): Promise<T | null>;
  run<T = unknown>(): Promise<T>;
}
export interface D1Like { prepare(sql: string): D1LikeStatement }

let database: D1Like | undefined;

export function configureRateLimitD1(d1: D1Like): void { database = d1; }

export async function enforceRateLimit(input: {
  key: string;
  limit: number;
  windowSeconds: number;
  now?: Date;
}): Promise<{ remaining: number; resetAt: string }> {
  if (!database) return { remaining: input.limit, resetAt: new Date((input.now ?? new Date()).getTime() + input.windowSeconds * 1000).toISOString() };
  const now = input.now ?? new Date();
  const resetAt = new Date(now.getTime() + input.windowSeconds * 1_000).toISOString();
  const sql = `INSERT INTO rate_limit_buckets(key,count,reset_at) VALUES(?1,1,?2)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limit_buckets.reset_at <= ?3 THEN 1 ELSE rate_limit_buckets.count + 1 END,
      reset_at = CASE WHEN rate_limit_buckets.reset_at <= ?3 THEN ?2 ELSE rate_limit_buckets.reset_at END
    RETURNING count, reset_at`;
  const row = await database.prepare(sql).bind(input.key, resetAt, now.toISOString()).first<{ count: number; reset_at: string }>();
  const count = row?.count ?? 1;
  const effectiveReset = row?.reset_at ?? resetAt;
  if (count > input.limit) {
    throw new AppError("RATE_LIMITED", "Too many requests.", 429);
  }
  return { remaining: Math.max(0, input.limit - count), resetAt: effectiveReset };
}

export function getRateLimitStore(): D1Like | undefined { return database; }
