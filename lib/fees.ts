export const BPS = 10_000n;
export const POWERCHAIN_SERVICE_FEE_BPS = 200n;

export function serviceFee(amount: bigint, bps = POWERCHAIN_SERVICE_FEE_BPS) {
  if (amount <= 0n) throw new Error("Amount must be greater than zero");
  if (bps < 0n || bps >= BPS) throw new Error("Invalid fee bps");
  return (amount * bps + BPS - 1n) / BPS;
}

export function totalDebit(amount: bigint, bps = POWERCHAIN_SERVICE_FEE_BPS) {
  return amount + serviceFee(amount, bps);
}
