#!/usr/bin/env node
// Coverage gate for the shipped runtime (#263).
//
// Two different jobs, so two different thresholds:
//
//  * The modules extracted out of tracker.js / viewer.js are pure and were
//    extracted precisely so they could be tested. They are held at 100% — if a
//    branch there goes uncovered, the extraction stopped paying for itself.
//  * Everything else in shared/ gets a floor well under today's numbers. The
//    point is to stop a silent slide, not to force a number: transport.js in
//    particular needs real sockets and sits around 40%.
//
// Run via `pnpm coverage`, which produces coverage/coverage-summary.json first.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SUMMARY = path.join(ROOT, 'coverage', 'coverage-summary.json');

// Extracted in #312; these are pure functions with no excuse for dead branches.
const STRICT_FILES = {
  'shared/pose-math.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
  'shared/hand-math.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
  'shared/room-layout.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
};

// Floors for shared/ as a whole. Measured at 92.03 / 73.16 / 89.51 / 92.03 when
// this gate was added; the floor sits below that so ordinary work does not trip
// it, while a real regression does.
const GLOBAL_FLOOR = { statements: 88, branches: 68, functions: 85, lines: 88 };

if (!fs.existsSync(SUMMARY)) {
  console.error(`Missing ${path.relative(ROOT, SUMMARY)}. Run \`pnpm coverage\` rather than this script directly.`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(SUMMARY, 'utf8'));
const failures = [];

const pct = (entry, metric) => entry?.[metric]?.pct ?? 0;

for (const [file, thresholds] of Object.entries(STRICT_FILES)) {
  const entry = summary[path.join(ROOT, file)] ?? summary[file];
  if (!entry) {
    failures.push(`${file}: not present in the coverage report (was it renamed or excluded?)`);
    continue;
  }
  for (const [metric, minimum] of Object.entries(thresholds)) {
    const actual = pct(entry, metric);
    if (actual < minimum) failures.push(`${file}: ${metric} ${actual}% is below the required ${minimum}%`);
  }
}

for (const [metric, minimum] of Object.entries(GLOBAL_FLOOR)) {
  const actual = pct(summary.total, metric);
  if (actual < minimum) failures.push(`shared/ overall: ${metric} ${actual}% is below the floor of ${minimum}%`);
}

if (failures.length) {
  console.error('Coverage gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const total = summary.total;
console.log(
  `OK: coverage gate passed. shared/ overall ${pct(total, 'statements')}% statements, `
  + `${pct(total, 'branches')}% branches, ${pct(total, 'functions')}% functions, ${pct(total, 'lines')}% lines; `
  + `${Object.keys(STRICT_FILES).length} extracted modules held at their thresholds.`,
);
