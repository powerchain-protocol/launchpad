export function unixSeconds(date: Date = new Date()): number {
  return Math.floor(date.getTime() / 1_000);
}

export function unixMilliseconds(date: Date = new Date()): number {
  return date.getTime();
}

export function isExpired(expiresAt: string | Date, now: Date = new Date()): boolean {
  const value = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  return !Number.isFinite(value) || value <= now.getTime();
}
