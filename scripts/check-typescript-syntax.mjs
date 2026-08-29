import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const compilerCandidates = [
  process.env.TYPESCRIPT_LIB,
  '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js',
  '/usr/local/lib/node_modules/typescript/lib/typescript.js',
].filter(Boolean);

let ts;
let compilerPath;
for (const candidate of compilerCandidates) {
  try {
    ts = require(candidate);
    compilerPath = candidate;
    break;
  } catch {}
}

if (!ts) {
  console.error(JSON.stringify({ ok: false, code: 'TYPESCRIPT_COMPILER_UNAVAILABLE' }, null, 2));
  process.exit(1);
}

const root = process.cwd();
const roots = ['apps', 'packages', 'prisma', 'scripts'];
const ignored = new Set(['node_modules', '.next', 'dist', 'generated', 'target']);
const files = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(full);
  }
}
for (const rel of roots) walk(path.join(root, rel));

const errors = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  for (const diagnostic of source.parseDiagnostics) {
    const pos = diagnostic.start == null ? undefined : source.getLineAndCharacterOfPosition(diagnostic.start);
    errors.push({
      file: path.relative(root, file),
      line: pos ? pos.line + 1 : undefined,
      column: pos ? pos.character + 1 : undefined,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    });
  }
}

const result = {
  ok: errors.length === 0,
  compiler: compilerPath,
  files: files.length,
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
