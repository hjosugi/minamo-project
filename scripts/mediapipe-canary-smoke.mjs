#!/usr/bin/env node
// Canary smoke check for upcoming @mediapipe/tasks-vision releases (#272).
//
// tasks-vision is a browser/WASM module that cannot run headlessly, so instead
// of executing it this asserts the *packaging surface* the tracker depends on
// still exists after a version bump:
//   1. the ESM entrypoint the tracker imports,
//   2. the WASM asset subpaths / files fetch-models.sh mirrors, and
//   3. the Face Landmarker API names the tracker reads (blendshapes +
//      facial transformation matrix) plus the four task classes.
//
// A breaking 1.0 change to any of these fails the scheduled canary early,
// pointing at docs/mediapipe-1.0-migration.md. Run against an installed
// @mediapipe/tasks-vision (the canary CI job installs the @nightly dist-tag,
// which carries the 1.0.0-rc.* builds).
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

// exports blocks ./package.json, so locate the package via its main entry.
const pkgDir = dirname(require.resolve('@mediapipe/tasks-vision'));
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

const problems = [];
const ok = [];
const check = (condition, label) => (condition ? ok : problems).push(label);

// 1) ESM entrypoint the tracker imports.
const moduleEntry = pkg.module || pkg.exports?.['.']?.import || pkg.exports?.['.']?.default;
check(typeof moduleEntry === 'string' && existsSync(join(pkgDir, moduleEntry)), `esm entrypoint: ${moduleEntry ?? '(missing)'}`);

// 2) WASM assets fetch-models.sh mirrors (SIMD + no-SIMD JS/WASM pairs).
for (const asset of [
  'wasm/vision_wasm_internal.js',
  'wasm/vision_wasm_internal.wasm',
  'wasm/vision_wasm_nosimd_internal.js',
  'wasm/vision_wasm_nosimd_internal.wasm',
]) {
  check(existsSync(join(pkgDir, asset)), `wasm asset: ${asset}`);
}

// 3) API surface the tracker reads, checked against the shipped type
// declarations (real names, unlike the minified bundle).
const typesEntry = pkg.types || pkg.exports?.['.']?.types || 'vision.d.ts';
const typesPath = join(pkgDir, typesEntry);
const types = existsSync(typesPath) ? readFileSync(typesPath, 'utf8') : '';
check(types.length > 0, `type declarations: ${typesEntry}`);
for (const symbol of [
  'FilesetResolver',
  'FaceLandmarker',
  'HandLandmarker',
  'PoseLandmarker',
  'faceBlendshapes',
  'facialTransformationMatrixes',
  'detectForVideo',
]) {
  check(types.includes(symbol), `api symbol: ${symbol}`);
}

console.log(`@mediapipe/tasks-vision@${pkg.version} canary smoke:`);
for (const line of ok) console.log(`  ok    ${line}`);
for (const line of problems) console.log(`  FAIL  ${line}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} canary check(s) failed for @mediapipe/tasks-vision@${pkg.version}.`);
  console.error('This likely signals a breaking packaging/API change. Review docs/mediapipe-1.0-migration.md before bumping the pin in package.json.');
  process.exit(1);
}

console.log(`\nAll ${ok.length} canary checks passed for @mediapipe/tasks-vision@${pkg.version}.`);
