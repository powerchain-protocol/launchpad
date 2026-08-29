const value = process.env.DATABASE_URL ?? "";
if (!/^postgres(?:ql)?:\/\//i.test(value)) {
  console.error("DATABASE_URL must be an explicit PostgreSQL URL before migration deployment.");
  process.exit(1);
}
if (/localhost|127\.0\.0\.1|example|placeholder|changeme/i.test(value) && process.env.ALLOW_LOCAL_DATABASE !== "1") {
  console.error("Refusing migration against a local/placeholder database without ALLOW_LOCAL_DATABASE=1.");
  process.exit(1);
}
console.log("Database migration target guard passed.");
