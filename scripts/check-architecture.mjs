import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const errors = [];
const sourceFiles = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", "dist", "generated"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) sourceFiles.push(full);
  }
}
walk("apps"); walk("packages");

for (const file of sourceFiles) {
  const rel = path.normalize(file);
  const text = fs.readFileSync(file, "utf8");
  if (rel.startsWith(path.normalize("apps/frontend"))) {
    const serverOnlyFrontend = rel.endsWith(path.normalize("apps/frontend/next.config.ts")) || rel.includes(`${path.sep}app${path.sep}api${path.sep}`) || rel.includes(`${path.sep}lib${path.sep}server${path.sep}`);
    if (!serverOnlyFrontend && /from\s+["']node:/.test(text)) errors.push(`${rel}: frontend imports Node built-in`);
    if (!serverOnlyFrontend && /from\s+["'][^"']*(?:prisma|\/db\/|launchpad-server)/.test(text)) errors.push(`${rel}: frontend crosses server/database boundary`);
    if (!serverOnlyFrontend && /process\.env\.(?!NEXT_PUBLIC_)/.test(text)) errors.push(`${rel}: browser-reachable frontend reads non-public environment variable`);
  }
  if (rel.includes(`${path.sep}app${path.sep}api${path.sep}`) && /NextResponse/.test(text)) {
    errors.push(`${rel}: API route bypasses centralized response boundary`);
  }
}

const hashes = new Map();
for (const file of sourceFiles) {
  if (["index.ts", "next-env.d.ts"].includes(path.basename(file))) continue;
  const stat = fs.statSync(file);
  if (stat.size < 200) continue;
  const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const previous = hashes.get(hash);
  if (previous) errors.push(`duplicate source implementation: ${previous} == ${file}`);
  else hashes.set(hash, file);
}

const prismaDirs = fs.readdirSync("prisma/migrations", { withFileTypes: true }).filter((e) => e.isDirectory());
const d1Files = fs.readdirSync("apps/backend/db/d1/migrations").filter((f) => f.endsWith(".sql"));
if (prismaDirs.length !== 1) errors.push("PostgreSQL canonical baseline must contain exactly one migration directory for a new deployment bundle");
if (d1Files.length !== 1) errors.push("D1 canonical baseline must contain exactly one SQL migration for a new deployment bundle");

if (errors.length) {
  console.error(JSON.stringify({ ok: false, check: "architecture", errors }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, check: "architecture", sourceFiles: sourceFiles.length, duplicateImplementations: 0 }, null, 2));
