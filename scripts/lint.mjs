import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const include = new Set(['.js', '.mjs', '.ts', '.html', '.css', '.md', '.yml', '.yaml', '.json', '.rs']);
const skipDirs = new Set(['.git', 'node_modules', 'dist', 'target', '.wrangler', 'vendor']);
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!include.has(path.extname(entry.name))) continue;
    lintFile(full);
  }
}

function lintFile(file) {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  if (!text.endsWith('\n')) failures.push(`${rel}: missing trailing newline`);
  lines.forEach((line, i) => {
    if (/[ \t]$/.test(line)) failures.push(`${rel}:${i + 1}: trailing whitespace`);
    if (line.includes('\t')) failures.push(`${rel}:${i + 1}: tab indentation`);
  });
  if (/(^|[^a-z])(?:TODO|TO DO)\s*[:(-]/i.test(text) && rel !== 'scripts/lint.mjs' && !rel.startsWith('issues/') && !rel.startsWith('docs/BACKLOG')) {
    failures.push(`${rel}: TODO marker left in tracked implementation/doc`);
  }
}

walk(root);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('OK: lint checks passed.');
