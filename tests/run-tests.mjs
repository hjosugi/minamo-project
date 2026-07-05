import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'README.md',
  'docs/QUICKSTART.md',
  'docs/PROTOCOL.md',
  'docs/PROTOCOL_V2_DRAFT.md',
  'docs/ARCHITECTURE.md',
  'docs/ARCHITECTURE_TARGET.md',
  'landing/index.html',
  'src/core/types.ts',
  'issues/index.csv',
];
for (const file of required) {
  assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);
}

const issuesDir = path.join(root, 'issues', 'backlog');
const issues = fs.readdirSync(issuesDir).filter((name) => name.endsWith('.md'));
assert.ok(issues.length >= 100, `Expected at least 100 issue files, got ${issues.length}`);
console.log(`OK: ${issues.length} issue files found.`);
