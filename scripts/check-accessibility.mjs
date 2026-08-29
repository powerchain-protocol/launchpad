import fs from "node:fs";
import path from "node:path";

const root = path.resolve("apps/frontend");
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:tsx|jsx|html)$/.test(entry.name)) files.push(full);
  }
}
walk(root);

const errors = [];
for (const file of files) {
  const rel = path.relative(process.cwd(), file);
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const n = index + 1;
    if (/href\s*=\s*["']#["']/.test(line)) errors.push(`${rel}:${n} dead href=\"#\"`);
    if (/<img\b/i.test(line) && !/\balt\s*=/.test(line)) errors.push(`${rel}:${n} img missing alt`);
    if (/target\s*=\s*["']_blank["']/.test(line) && !/rel\s*=\s*["'][^"']*(?:noopener|noreferrer)/.test(line)) {
      errors.push(`${rel}:${n} target=_blank missing noopener/noreferrer`);
    }
    if (/\b(?:outline-none|focus:outline-none)\b/.test(line) && !/focus-visible:(?:ring|outline)/.test(line)) {
      errors.push(`${rel}:${n} focus outline removed without focus-visible replacement`);
    }
  });
}

if (errors.length) {
  console.error(JSON.stringify({ ok: false, check: "accessibility-regressions", errors }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, check: "accessibility-regressions", scannedFiles: files.length }, null, 2));
