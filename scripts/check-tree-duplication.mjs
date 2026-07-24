#!/usr/bin/env node
// Guardrail against the two-tree divergence described in #255.
//
// The shipped runtime is 100% shared/*.js. src/**/*.ts is a parallel *typed*
// core used only by the vitest suites, `pnpm benchmark:drum`, and diagnostics —
// it is not wired into tracker/viewer/replay/desktop. Where the same helper is
// implemented in both trees it drifts apart (a fix lands on one side only), so
// this check freezes the currently-known duplicates and fails the build when a
// NEW function/class/const name is exported by BOTH trees.
//
// To de-duplicate: keep one implementation and delete the other, then remove the
// name from ALLOWED. To (rarely) add an intentional duplicate: append it here
// with a justification.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Pre-existing cross-tree duplicates (frozen; do not grow this list).
const ALLOWED = new Set([
  'OneEuroFilter', // shared/filters.js (runtime) vs src/core/oneEuroFilter.ts
  'clamp', // shared math helper vs src/core/math.ts
  'classifyHandGesture', // shared/runtime.js vs src/core/hand.ts
  'inferVowel', // shared/expression-mapping.js vs src/core/face.ts
  'shortestPathQuat', // shared/motion-quant.js vs src/core/stability.ts
]);

const EXPORT_RE = /export\s+(?:async\s+)?(?:function|class|const)\s+([A-Za-z_$][\w$]*)/g;

function walk(dir, ext, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, out);
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function exportedNames(files) {
  const names = new Set();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(EXPORT_RE)) {
      names.add(match[1]);
    }
  }
  return names;
}

const sharedNames = exportedNames(walk(join(ROOT, 'shared'), '.js'));
const srcNames = exportedNames(walk(join(ROOT, 'src'), '.ts'));

const duplicates = [...sharedNames].filter((name) => srcNames.has(name)).sort();
const unexpected = duplicates.filter((name) => !ALLOWED.has(name));
const staleAllowed = [...ALLOWED].filter((name) => !duplicates.includes(name)).sort();

if (unexpected.length) {
  console.error('New cross-tree duplicate export(s) — exported by BOTH shared/*.js and src/**/*.ts:');
  for (const name of unexpected) console.error(`  - ${name}`);
  console.error('\nThe runtime is shared/*.js; do not add a parallel implementation in src/ (or vice');
  console.error('versa). Reuse the existing one, or if the duplication is genuinely intentional add the');
  console.error('name to ALLOWED in scripts/check-tree-duplication.mjs with a justification. See #255.');
  process.exit(1);
}

if (staleAllowed.length) {
  console.error('These names are in the ALLOWED duplicate list but are no longer duplicated:');
  for (const name of staleAllowed) console.error(`  - ${name}`);
  console.error('\nGood — a duplicate was removed. Now delete these from ALLOWED in');
  console.error('scripts/check-tree-duplication.mjs so the guardrail stays tight (#255).');
  process.exit(1);
}

console.log(`OK: no new cross-tree duplicate exports (${duplicates.length} known, frozen).`);
