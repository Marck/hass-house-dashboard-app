// Fails when a file that could be committed contains something that must not
// be public: addresses, credentials, private host names, or an em dash.
// It prints the file and line number only, never the matched text.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude', 'dist', 'coverage', '.venv']);
// Generated or binary files, and this file (it names the patterns it looks for).
const SKIP_FILES = new Set(['package-lock.json', 'scripts/privacy-check.mjs']);
const TEXT = /\.(js|mjs|json|css|html|md|yml|yaml|sh|txt|svg)$|^\.[\w.-]+$|^LICENSE$/;

const ALLOWED_ADDRESSES = new Set(['127.0.0.1', '0.0.0.0']);
const CHECKS = [
  { name: 'IPv4 address', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, allow: (m) => ALLOWED_ADDRESSES.has(m) },
  { name: 'MAC address', re: /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi },
  { name: 'email address', re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, allow: (m) => m.endsWith('@v7') || /^[\w.-]+@[0-9a-f]{40}$/.test(m) },
  { name: 'access token', re: /eyJ[\w-]{10,}\.eyJ[\w-]{10,}/g },
  { name: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'credential assignment', re: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/gi },
  { name: 'private host name', re: /\b[a-z0-9-]{2,}\.(?:lan|internal|home\.arpa|local)\b/gi, skip: (file) => file === '.gitignore' },
  { name: 'em dash', re: /—/g },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(path, out);
    } else {
      out.push(path);
    }
  }
  return out;
}

const problems = [];
let scanned = 0;
for (const path of walk(ROOT)) {
  const file = relative(ROOT, path);
  if (SKIP_FILES.has(file) || !TEXT.test(file.split('/').pop())) continue;
  scanned += 1;
  readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
    for (const check of CHECKS) {
      if (check.skip && check.skip(file)) continue;
      const hits = (line.match(check.re) || []).filter((m) => !(check.allow && check.allow(m)));
      if (hits.length) problems.push(`${file}:${index + 1}: ${check.name}`);
    }
  });
}

if (problems.length) {
  console.error(`Privacy check failed:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`Privacy check passed (${scanned} files).`);
