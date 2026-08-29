export interface D1Result<T = unknown> {
  success: boolean;
  results?: T[];
  meta?: Record<string, unknown>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<D1Result<T>>>;
  exec(query: string): Promise<D1Result>;
}

let activeD1: D1Database | undefined;

export function installCheckoutD1(database: D1Database): void {
  activeD1 = database;
}

export function getCheckoutD1(): D1Database {
  if (!activeD1) throw new Error("Checkout D1 database has not been installed.");
  return activeD1;
}
