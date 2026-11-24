import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  CanaryInputError,
  DEFAULT_BASELINE,
  compareToBaseline,
  main,
  renderSummary,
  validateBaseline,
} from '../scripts/mediapipe-canary-compare.mjs';
import { FORBIDDEN_MEDIAPIPE_TELEMETRY_MARKERS } from '../scripts/mediapipe-privacy-guard.mjs';

// No network: every package, report and baseline here is a local fixture.

const SMOKE = new URL('../scripts/mediapipe-canary-smoke.mjs', import.meta.url).pathname;
const committedBaseline = JSON.parse(readFileSync(DEFAULT_BASELINE, 'utf8'));

const NO_SIMD = ['wasm asset: wasm/vision_wasm_nosimd_internal.js', 'wasm asset: wasm/vision_wasm_nosimd_internal.wasm'];
const TELEMETRY = ['odml-metrics-endpoint', 'odml-api-key-header'].map((marker) => `privacy: ${marker} in vision_bundle.mjs`);

const fixtureBaseline = (accepted = [...NO_SIMD, ...TELEMETRY]) => ({
  schema: 1,
  policy: 'fixture policy: accepted while pinned',
  pinnedVersion: '0.10.35',
  decisions: { d1: { date: '2026-11-24', summary: 'stay pinned', doc: 'docs/mediapipe-1.0-migration.md' } },
  targets: {
    nightly: { accepted: accepted.map((check) => ({ check, reason: `known: ${check}`, decision: 'd1' })) },
    latest: { accepted: accepted.map((check) => ({ check, reason: `known: ${check}`, decision: 'd1' })) },
  },
});

const fixtureReport = (failures = [...NO_SIMD, ...TELEMETRY], version = '1.3.0-rc.1') => ({
  package: '@mediapipe/tasks-vision',
  version,
  ok: ['esm entrypoint: vision_bundle.mjs', 'api symbol: FaceLandmarker'],
  failures,
});

describe('canary comparison against the accepted baseline', () => {
  it('goes green and says the known findings persist when nothing changed', () => {
    const result = compareToBaseline({ target: 'nightly', report: fixtureReport(), baseline: fixtureBaseline() });
    expect(result.status).toBe('green');
    expect(result.newFindings).toEqual([]);
    expect(result.gone).toEqual([]);
    expect(result.persisting).toBe(4);
    expect(result.headline).toMatch(/^Known findings persist: 4 accepted finding\(s\) still present/);
    expect(result.headline).toContain('stays pinned to 0.10.35');
  });

  it('goes red when a failing check appears that the baseline does not accept', () => {
    const report = fixtureReport([...NO_SIMD, ...TELEMETRY, 'api symbol: FaceLandmarker']);
    const result = compareToBaseline({ target: 'nightly', report, baseline: fixtureBaseline() });
    expect(result.status).toBe('red');
    expect(result.newFindings.map((finding) => finding.check)).toEqual(['api symbol: FaceLandmarker']);
    expect(result.gone).toEqual([]);
    expect(result.headline).toContain('NEW finding(s)');
    expect(result.headline).toContain('api symbol: FaceLandmarker');
  });

  it('goes red when a telemetry marker shows up in a bundle the baseline has not accepted', () => {
    const report = fixtureReport([...NO_SIMD, ...TELEMETRY, 'privacy: odml-metrics-endpoint in vision_bundle_new.mjs']);
    const result = compareToBaseline({ target: 'latest', report, baseline: fixtureBaseline() });
    expect(result.status).toBe('red');
    expect(result.newFindings.map((finding) => finding.check)).toEqual([
      'privacy: odml-metrics-endpoint in vision_bundle_new.mjs',
    ]);
  });

  it('goes red with a plain "revisit the decision" message when a baselined finding disappears', () => {
    const report = fixtureReport([...NO_SIMD, TELEMETRY[0]]);
    const result = compareToBaseline({ target: 'nightly', report, baseline: fixtureBaseline() });
    expect(result.status).toBe('red');
    expect(result.newFindings).toEqual([]);
    expect(result.gone.map((item) => item.check)).toEqual([TELEMETRY[1]]);
    expect(result.headline).toContain('BASELINED FINDING(S) GONE');
    expect(result.headline).toContain('Upstream changed something');
    expect(result.headline).toContain('revisit the decision');
    expect(result.headline).toContain('docs/mediapipe-1.0-migration.md');
  });

  it('goes red when a scan that used to fail every baselined check now passes them all', () => {
    const result = compareToBaseline({ target: 'latest', report: fixtureReport([], '1.9.0'), baseline: fixtureBaseline() });
    expect(result.status).toBe('red');
    expect(result.gone).toHaveLength(4);
  });

  it('reports both problems at once when one finding is new and another is gone', () => {
    const report = fixtureReport([...NO_SIMD, TELEMETRY[0], 'esm entrypoint: vision_bundle.mjs']);
    const result = compareToBaseline({ target: 'nightly', report, baseline: fixtureBaseline() });
    expect(result.status).toBe('red');
    expect(result.reasons).toHaveLength(2);
  });

  it('judges each target against its own baseline entry', () => {
    const baseline = fixtureBaseline();
    baseline.targets.latest.accepted = baseline.targets.latest.accepted.slice(0, 2);
    expect(compareToBaseline({ target: 'nightly', report: fixtureReport(), baseline }).status).toBe('green');
    expect(compareToBaseline({ target: 'latest', report: fixtureReport(), baseline }).status).toBe('red');
  });

  it('does not let a different resolved version change the verdict', () => {
    const baseline = fixtureBaseline();
    expect(compareToBaseline({ target: 'latest', report: fixtureReport(undefined, '1.2.3'), baseline }).status).toBe('green');
    expect(compareToBaseline({ target: 'latest', report: fixtureReport(undefined, '1.2.4'), baseline }).status).toBe('green');
  });

  it('refuses to judge input it cannot trust instead of going green', () => {
    const baseline = fixtureBaseline();
    expect(() => compareToBaseline({ target: 'beta', report: fixtureReport(), baseline })).toThrow(CanaryInputError);
    expect(() => compareToBaseline({ target: 'nightly', report: { ...fixtureReport(), failures: 'x' }, baseline })).toThrow(
      CanaryInputError,
    );
    expect(() => compareToBaseline({ target: 'nightly', report: { ...fixtureReport(), version: '' }, baseline })).toThrow(
      CanaryInputError,
    );
    expect(() =>
      compareToBaseline({ target: 'nightly', report: { ...fixtureReport([]), ok: [] }, baseline }),
    ).toThrow(/no checks/);
    expect(() => compareToBaseline({ target: 'nightly', report: fixtureReport(), baseline: {} })).toThrow(CanaryInputError);
  });

  it('writes the full result to the summary, including for a green run', () => {
    const green = compareToBaseline({ target: 'nightly', report: fixtureReport(), baseline: fixtureBaseline() });
    const markdown = renderSummary(green);
    expect(markdown).toContain('**GREEN, known findings persist.**');
    expect(markdown).toContain('@mediapipe/tasks-vision@1.3.0-rc.1');
    for (const check of [...NO_SIMD, ...TELEMETRY]) expect(markdown).toContain(`\`${check}\``);
    expect(markdown).toContain('2 passing check(s)');
    expect(markdown).toContain('fixture policy: accepted while pinned');
    expect(markdown).toContain('docs/mediapipe-1.0-migration.md');

    const red = compareToBaseline({
      target: 'nightly',
      report: fixtureReport([...NO_SIMD, 'api symbol: FaceLandmarker']),
      baseline: fixtureBaseline(),
    });
    const redMarkdown = renderSummary(red);
    expect(redMarkdown).toContain('**RED.**');
    expect(redMarkdown).toContain('NEW, not accepted');
    expect(redMarkdown).toContain('Baselined findings that are gone');
  });
});

describe('committed baseline scripts/mediapipe-canary-baseline.json', () => {
  it('is well formed and records its decision', () => {
    expect(validateBaseline(committedBaseline)).toEqual([]);
    expect(committedBaseline.policy).toMatch(/WHILE MINAMO STAYS PINNED/);
    expect(committedBaseline.decisions['stay-pinned-2026-11-24'].doc).toBe('docs/mediapipe-1.0-migration.md');
  });

  it('stays tied to the exact production pin', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.dependencies['@mediapipe/tasks-vision']).toBe(committedBaseline.pinnedVersion);
  });

  it('accepts exactly the known findings for both nightly and latest', () => {
    const expected = [
      ...NO_SIMD,
      ...['vision_bundle.cjs', 'vision_bundle.js', 'vision_bundle.mjs'].flatMap((file) =>
        FORBIDDEN_MEDIAPIPE_TELEMETRY_MARKERS.map(({ id }) => `privacy: ${id} in ${file}`),
      ),
    ];
    expect(Object.keys(committedBaseline.targets).sort()).toEqual(['latest', 'nightly']);
    for (const target of ['nightly', 'latest']) {
      expect(committedBaseline.targets[target].accepted.map((item) => item.check).sort()).toEqual([...expected].sort());
    }
  });

  it('rejects malformed baselines', () => {
    const duplicate = fixtureBaseline([NO_SIMD[0], NO_SIMD[0]]);
    expect(validateBaseline(duplicate).join()).toContain('duplicate');
    const noReason = fixtureBaseline();
    noReason.targets.nightly.accepted[0].reason = '';
    expect(validateBaseline(noReason).join()).toContain('has no reason');
    const noDecision = fixtureBaseline();
    noDecision.targets.nightly.accepted[0].decision = 'nope';
    expect(validateBaseline(noDecision).join()).toContain('unknown decision');
  });
});

describe('smoke script --json, end to end on fixture packages', () => {
  const root = mkdtempSync(join(tmpdir(), 'minamo-canary-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  let counter = 0;

  function makePackage({ bundles, omit = [], version = '1.3.0-rc.1' }) {
    const dir = join(root, `pkg-${counter++}`);
    mkdirSync(join(dir, 'wasm'), { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: '@mediapipe/tasks-vision', version, main: 'vision_bundle.cjs', module: 'vision_bundle.mjs', types: 'vision.d.ts' }),
    );
    writeFileSync(
      join(dir, 'vision.d.ts'),
      'FilesetResolver FaceLandmarker HandLandmarker PoseLandmarker faceBlendshapes facialTransformationMatrixes detectForVideo',
    );
    for (const [file, source] of Object.entries(bundles)) writeFileSync(join(dir, file), source);
    for (const asset of [
      'vision_wasm_internal.js',
      'vision_wasm_internal.wasm',
      'vision_wasm_nosimd_internal.js',
      'vision_wasm_nosimd_internal.wasm',
    ]) {
      if (!omit.includes(asset)) writeFileSync(join(dir, 'wasm', asset), '');
    }
    return dir;
  }

  const smokeJson = (dir) => JSON.parse(execFileSync(process.execPath, [SMOKE, '--package-dir', dir, '--json'], { encoding: 'utf8' }));

  const clean = 'fetch(modelAssetPath);';
  const dirty = 'x odml.pa.googleapis.com/v1/log y x-goog-api-key z';

  it('keeps the human output and exit code unchanged without --json', () => {
    const dir = makePackage({ bundles: { 'vision_bundle.cjs': clean, 'vision_bundle.mjs': dirty } });
    const run = spawnSync(process.execPath, [SMOKE, '--package-dir', dir], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stdout).toContain('@mediapipe/tasks-vision@1.3.0-rc.1 canary smoke:');
    expect(run.stdout).toMatch(/FAIL {2}privacy: no ODML telemetry endpoint\/sender \(vision_bundle\.mjs:odml-metrics-endpoint, vision_bundle\.mjs:odml-api-key-header\)/);
    expect(run.stderr).toContain('1 canary check(s) failed for @mediapipe/tasks-vision@1.3.0-rc.1.');

    const cleanDir = makePackage({ bundles: { 'vision_bundle.cjs': clean, 'vision_bundle.mjs': clean } });
    const pass = spawnSync(process.execPath, [SMOKE, '--package-dir', cleanDir], { encoding: 'utf8' });
    expect(pass.status).toBe(0);
    expect(pass.stdout).toContain('canary checks passed for @mediapipe/tasks-vision@1.3.0-rc.1.');
  });

  it('emits one stable id per finding, then goes green against a baseline of those findings', () => {
    const dir = makePackage({
      bundles: { 'vision_bundle.cjs': clean, 'vision_bundle.mjs': dirty },
      omit: ['vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'],
    });
    const report = smokeJson(dir);
    expect(report.version).toBe('1.3.0-rc.1');
    expect(report.failures).toEqual([...NO_SIMD, ...TELEMETRY]);
    expect(report.ok).toContain('privacy bundles: resolved browser entry files');
    const result = compareToBaseline({ target: 'nightly', report, baseline: fixtureBaseline(report.failures) });
    expect(result.status).toBe('green');
  });

  it('goes red when the same baseline meets a package with an extra telemetry marker', () => {
    const dir = makePackage({
      bundles: { 'vision_bundle.cjs': clean, 'vision_bundle.mjs': `${dirty} _mediapipeLoggerGetEncodedApiKey` },
      omit: ['vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'],
    });
    const report = smokeJson(dir);
    const result = compareToBaseline({ target: 'nightly', report, baseline: fixtureBaseline() });
    expect(result.status).toBe('red');
    expect(result.newFindings.map((finding) => finding.check)).toEqual([
      'privacy: mediapipe-logger-api-key-bridge in vision_bundle.mjs',
    ]);
  });

  it('goes red when upstream fixes a baselined finding', () => {
    const dir = makePackage({
      bundles: { 'vision_bundle.cjs': clean, 'vision_bundle.mjs': 'x odml.pa.googleapis.com/v1/log y' },
      omit: ['vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'],
    });
    const result = compareToBaseline({ target: 'nightly', report: smokeJson(dir), baseline: fixtureBaseline() });
    expect(result.status).toBe('red');
    expect(result.headline).toContain('revisit the decision');
  });

  it('errors, rather than reporting, when the package to scan is missing', () => {
    const run = spawnSync(process.execPath, [SMOKE, '--package-dir', join(root, 'does-not-exist'), '--json'], { encoding: 'utf8' });
    expect(run.status).not.toBe(0);
    expect(run.stdout).toBe('');
  });

  it('runs the whole CLI: summary file written for green and red, exit codes 0 / 1 / 2', () => {
    const dir = makePackage({
      bundles: { 'vision_bundle.cjs': clean, 'vision_bundle.mjs': dirty },
      omit: ['vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'],
    });
    const reportFile = join(root, 'report.json');
    writeFileSync(reportFile, JSON.stringify(smokeJson(dir)));
    const baselineFile = join(root, 'baseline.json');
    writeFileSync(baselineFile, JSON.stringify(fixtureBaseline()));
    const summaryFile = join(root, 'summary.md');
    const quiet = (fn) => {
      const log = console.log;
      const error = console.error;
      console.log = () => {};
      console.error = () => {};
      try {
        return fn();
      } finally {
        console.log = log;
        console.error = error;
      }
    };
    const argv = ['--target', 'nightly', '--report', reportFile, '--baseline', baselineFile, '--summary', summaryFile];

    expect(quiet(() => main(argv, {}))).toBe(0);
    expect(readFileSync(summaryFile, 'utf8')).toContain('GREEN, known findings persist');

    const trimmed = fixtureBaseline(NO_SIMD);
    writeFileSync(baselineFile, JSON.stringify(trimmed));
    expect(quiet(() => main(argv, {}))).toBe(1);
    expect(readFileSync(summaryFile, 'utf8')).toContain('NEW, not accepted');

    expect(quiet(() => main(['--target', 'beta', ...argv.slice(2)], {}))).toBe(2);
    expect(quiet(() => main(['--target', 'nightly', '--report', join(root, 'missing.json')], {}))).toBe(2);
  });
});
