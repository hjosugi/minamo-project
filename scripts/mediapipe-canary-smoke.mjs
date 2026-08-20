#!/usr/bin/env node
// Canary smoke check for upcoming @mediapipe/tasks-vision releases (#272).
//
// tasks-vision is a browser/WASM module that cannot run headlessly, so instead
// of executing it this asserts the packaging and privacy surface the tracker
// depends on still exists after a version bump:
//   1. the ESM entrypoint the tracker imports,
//   2. the WASM asset subpaths / files fetch-models.sh mirrors, and
//   3. the Face Landmarker API names the tracker reads (blendshapes +
//      facial transformation matrix) plus the four task classes, and
//   4. the browser bundles contain no known ODML telemetry endpoint/sender.
//
// A change to any of these fails the scheduled canary early, pointing at
// docs/mediapipe-1.0-migration.md. Run against an installed
// @mediapipe/tasks-vision (the canary CI job installs the @nightly dist-tag).
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { findForbiddenMediaPipeTelemetry } from './mediapipe-privacy-guard.mjs';

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

// 4) Privacy surface. Starting in the published 1.0 line, MediaPipe browser
// bundles can automatically POST performance/utilization metrics to Google's
// ODML logging service. This is incompatible with Minamo's local-only mode.
// Scan every root vision bundle as well as all conditional root entrypoints so
// a package.json export reshuffle cannot hide the sender from the check.
const entryCandidates = new Set();
const collectEntries = (value) => {
  if (typeof value === 'string') entryCandidates.add(value.replace(/^\.\//, ''));
  else if (value && typeof value === 'object') Object.values(value).forEach(collectEntries);
};
collectEntries(pkg.main);
collectEntries(pkg.browser);
collectEntries(pkg.module);
collectEntries(pkg.exports?.['.']);
for (const file of readdirSync(pkgDir)) {
  if (/^vision_bundle\.(?:mjs|cjs|js)$/.test(file)) entryCandidates.add(file);
}
const browserBundles = [...entryCandidates]
  .filter((file) => /\.(?:mjs|cjs|js)$/.test(file) && existsSync(join(pkgDir, file)))
  .sort()
  .map((file) => ({ file, source: readFileSync(join(pkgDir, file), 'utf8') }));
check(browserBundles.length > 0, 'privacy bundles: resolved browser entry files');
const telemetryFindings = findForbiddenMediaPipeTelemetry(browserBundles);
const telemetrySummary = telemetryFindings
  .map(({ file, marker }) => `${file}:${marker}`)
  .join(', ');
check(
  telemetryFindings.length === 0,
  `privacy: no ODML telemetry endpoint/sender${telemetrySummary ? ` (${telemetrySummary})` : ''}`,
);

console.log(`@mediapipe/tasks-vision@${pkg.version} canary smoke:`);
for (const line of ok) console.log(`  ok    ${line}`);
for (const line of problems) console.log(`  FAIL  ${line}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} canary check(s) failed for @mediapipe/tasks-vision@${pkg.version}.`);
  console.error('This signals a packaging, API, or privacy regression. Review docs/mediapipe-1.0-migration.md before bumping the pin in package.json.');
  process.exit(1);
}

console.log(`\nAll ${ok.length} canary checks passed for @mediapipe/tasks-vision@${pkg.version}.`);
