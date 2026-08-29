import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const migrationPath = "apps/backend/db/d1/migrations/0001_v1_0_0.sql";
const sql = fs.readFileSync(migrationPath, "utf8");
const db = new DatabaseSync(":memory:");
try {
  db.exec(sql);
  const expected = [
    "checkout_quotes", "checkout_orders", "checkout_transaction_intents",
    "checkout_rpc_observations", "checkout_receipts",
    "rate_limit_buckets", "realtime_sessions",
  ];
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  const missing = expected.filter((name) => !tables.includes(name));
  if (missing.length) throw new Error(`missing tables: ${missing.join(", ")}`);

  const now = "2026-08-28T00:00:00.000Z";
  const later = "2026-08-28T00:05:00.000Z";
  db.prepare(`INSERT INTO checkout_quotes
    (id,quote_hash,chain,network,wallet,payment_asset,payment_amount_atomic,receive_mint_or_type,receive_amount_atomic,treasury_address,service_fee_atomic,service_fee_recipient,nonce,issued_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "q1", "a".repeat(64), "solana", "devnet", "wallet", "SOL", "1000", "pwrc", "5000", "treasury", "20", "fee", "nonce", now, later,
    );
  db.prepare(`INSERT INTO checkout_orders
    (id,idempotency_key,quote_id,quote_hash,wallet,chain,network,state,intent_hash,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      "o1", "idem-1", "q1", "a".repeat(64), "wallet", "solana", "devnet", "AWAITING_SIGNATURE", "b".repeat(64), now, now,
    );
  db.prepare(`INSERT INTO checkout_transaction_intents
    (order_id,quote_id,quote_hash,intent_hash,chain,network,wallet,transfers_json,service_fee_atomic,issued_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      "o1", "q1", "a".repeat(64), "b".repeat(64), "solana", "devnet", "wallet", "[]", "20", now, later,
    );

  const upsert = db.prepare(`
    INSERT INTO rate_limit_buckets (key, count, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
      reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
    RETURNING count, reset_at
  `);
  const first = upsert.get("ip:route", later, now, now);
  const second = upsert.get("ip:route", later, now, now);
  if (Number(first.count) !== 1 || Number(second.count) !== 2) throw new Error("rate-limit UPSERT did not increment atomically");

  let constraintWorked = false;
  try {
    db.prepare("UPDATE checkout_orders SET state='INVALID' WHERE id='o1'").run();
  } catch { constraintWorked = true; }
  if (!constraintWorked) throw new Error("checkout order state CHECK constraint did not reject invalid state");

  console.log(JSON.stringify({ ok: true, check: "d1-migration", migration: migrationPath, tables: expected.length, rateLimitUpsert: true, constraints: true }, null, 2));
} finally {
  db.close();
}
