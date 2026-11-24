#!/usr/bin/env node
// Judges one scheduled-canary scan against the committed baseline (#272).
//
//   node scripts/mediapipe-canary-compare.mjs --target nightly --report report.json
//     [--baseline scripts/mediapipe-canary-baseline.json] [--summary file.md]
//
// `report.json` is the output of `mediapipe-canary-smoke.mjs --json`. The
// baseline (scripts/mediapipe-canary-baseline.json) lists, per scanned target,
// the failing checks the owner has accepted while Minamo stays pinned to
// @mediapipe/tasks-vision 0.10.35. The scheduled job is advisory; the PR and
// release gates (`pnpm check:mediapipe`) are unaffected and stay zero-tolerance.
//
// The job goes red only when:
//   (a) a failing check appears that the baseline does not accept,
//   (b) a baselined finding disappears (upstream changed something: revisit the
//       decision, then update the baseline on purpose), or
//   (c) the input cannot be read or does not look like a scan report. (An
//       install or scan step that errors fails its own earlier step.)
// Otherwise it exits 0 and says plainly that the known findings persist. The
// full result is always appended to $GITHUB_STEP_SUMMARY (or --summary).
import { appendFileSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DEFAULT_BASELINE = fileURLToPath(new URL('./mediapipe-canary-baseline.json', import.meta.url));

export class CanaryInputError extends Error {}

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

/** Returns a list of problems with the baseline file; empty when it is well formed. */
export function validateBaseline(baseline) {
  const problems = [];
  if (!baseline || typeof baseline !== 'object') return ['baseline is not an object'];
  if (baseline.schema !== 1) problems.push('baseline.schema must be 1');
  if (!isNonEmptyString(baseline.policy)) problems.push('baseline.policy must state what the baseline means');
  if (!isNonEmptyString(baseline.pinnedVersion)) problems.push('baseline.pinnedVersion must name the accepted pin');
  const decisions = baseline.decisions && typeof baseline.decisions === 'object' ? baseline.decisions : {};
  if (Object.keys(decisions).length === 0) problems.push('baseline.decisions must record at least one decision');
  for (const [key, decision] of Object.entries(decisions)) {
    for (const field of ['date', 'summary', 'doc']) {
      if (!isNonEmptyString(decision?.[field])) problems.push(`decision ${key}: missing ${field}`);
    }
  }
  const targets = baseline.targets && typeof baseline.targets === 'object' ? baseline.targets : {};
  if (Object.keys(targets).length === 0) problems.push('baseline.targets must list the scanned targets');
  for (const [target, entry] of Object.entries(targets)) {
    if (!Array.isArray(entry?.accepted)) {
      problems.push(`target ${target}: accepted must be an array`);
      continue;
    }
    const seen = new Set();
    for (const item of entry.accepted) {
      if (!isNonEmptyString(item?.check)) {
        problems.push(`target ${target}: an accepted entry has no check label`);
        continue;
      }
      if (seen.has(item.check)) problems.push(`target ${target}: duplicate accepted check "${item.check}"`);
      seen.add(item.check);
      if (!isNonEmptyString(item.reason)) problems.push(`target ${target}: "${item.check}" has no reason`);
      if (!Object.hasOwn(decisions, item.decision)) {
        problems.push(`target ${target}: "${item.check}" points at unknown decision "${item.decision}"`);
      }
    }
  }
  return problems;
}

/** Returns a list of problems with a smoke `--json` report; empty when it is well formed. */
export function validateReport(report) {
  const problems = [];
  if (!report || typeof report !== 'object') return ['report is not an object'];
  if (report.package !== '@mediapipe/tasks-vision') problems.push('report.package must be @mediapipe/tasks-vision');
  if (!isNonEmptyString(report.version)) problems.push('report.version is missing');
  for (const field of ['ok', 'failures']) {
    if (!Array.isArray(report[field]) || !report[field].every(isNonEmptyString)) {
      problems.push(`report.${field} must be an array of check labels`);
    }
  }
  // A scan that checked nothing must not read as a clean scan.
  if (Array.isArray(report.ok) && Array.isArray(report.failures) && report.ok.length + report.failures.length === 0) {
    problems.push('report contains no checks');
  }
  return problems;
}

/**
 * Compares the failing checks of one scan with the baseline accepted for the
 * target. Pure: no I/O, so it is tested with fixtures.
 */
export function compareToBaseline({ target, report, baseline }) {
  const problems = [...validateBaseline(baseline), ...validateReport(report)];
  if (!isNonEmptyString(target)) problems.push('target is missing');
  else if (!baseline?.targets?.[target]) problems.push(`baseline has no entry for target "${target}"`);
  if (problems.length > 0) throw new CanaryInputError(problems.join('; '));

  const accepted = new Map(baseline.targets[target].accepted.map((item) => [item.check, item]));
  const failing = [...new Set(report.failures)];
  const findings = failing.map((check) => {
    const item = accepted.get(check);
    return item
      ? { check, state: 'accepted', reason: item.reason, decision: item.decision }
      : { check, state: 'new' };
  });
  const newFindings = findings.filter((finding) => finding.state === 'new');
  const gone = [...accepted.values()].filter((item) => !failing.includes(item.check));
  const persisting = findings.length - newFindings.length;
  const label = `${target} (@mediapipe/tasks-vision@${report.version})`;

  const reasons = [];
  if (newFindings.length > 0) {
    reasons.push(
      `NEW finding(s) for ${label} that the baseline does not accept: ${newFindings.map((f) => f.check).join('; ')}. ` +
        'A check that previously passed now fails. Investigate before anything else; do not add it to the baseline ' +
        'without an explicit owner decision.',
    );
  }
  if (gone.length > 0) {
    reasons.push(
      `BASELINED FINDING(S) GONE for ${label}: ${gone.map((item) => item.check).join('; ')}. ` +
        `Upstream changed something, which is the signal to revisit the decision to stay pinned to ${baseline.pinnedVersion} ` +
        '(docs/mediapipe-1.0-migration.md). Re-run its acceptance checklist, then update ' +
        'scripts/mediapipe-canary-baseline.json on purpose.',
    );
  }
  const status = reasons.length > 0 ? 'red' : 'green';
  const headline =
    status === 'green'
      ? `Known findings persist: ${persisting} accepted finding(s) still present for ${label}, nothing new and ` +
        `nothing gone. Minamo stays pinned to ${baseline.pinnedVersion}; no action needed.`
      : reasons.join(' ');
  return {
    status,
    target,
    version: report.version,
    headline,
    reasons,
    findings,
    newFindings,
    gone,
    persisting,
    passed: report.ok,
    policy: baseline.policy,
    decisions: baseline.decisions,
  };
}

const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Markdown for $GITHUB_STEP_SUMMARY: the whole result, green or red. */
export function renderSummary(result) {
  const verdict = result.status === 'green' ? 'GREEN, known findings persist' : 'RED';
  const lines = [
    `## MediaPipe canary: ${result.target}`,
    '',
    `**${verdict}.** ${result.headline}`,
    '',
    '| | |',
    '|---|---|',
    `| Target | \`${cell(result.target)}\` |`,
    `| Resolved version | \`@mediapipe/tasks-vision@${cell(result.version)}\` |`,
    `| Checks passed | ${result.passed.length} |`,
    `| Failing checks | ${result.findings.length} (${result.persisting} accepted by the baseline, ${result.newFindings.length} new) |`,
    `| Baselined findings gone | ${result.gone.length} |`,
    '',
  ];
  if (result.findings.length > 0) {
    lines.push('### Failing checks', '', '| Baseline | Check | Reason |', '|---|---|---|');
    for (const finding of result.findings) {
      lines.push(
        finding.state === 'new'
          ? `| **NEW, not accepted** | \`${cell(finding.check)}\` | not in the baseline |`
          : `| accepted | \`${cell(finding.check)}\` | ${cell(finding.reason)} |`,
      );
    }
    lines.push('');
  } else {
    lines.push('### Failing checks', '', 'None.', '');
  }
  if (result.gone.length > 0) {
    lines.push(
      '### Baselined findings that are gone',
      '',
      'Upstream changed something: revisit the decision (docs/mediapipe-1.0-migration.md).',
      '',
    );
    for (const item of result.gone) lines.push(`- \`${cell(item.check)}\` (accepted because: ${cell(item.reason)})`);
    lines.push('');
  }
  lines.push('### Baseline', '', result.policy, '');
  for (const [key, decision] of Object.entries(result.decisions)) {
    lines.push(`- \`${key}\` (${decision.date}): ${decision.summary} See \`${decision.doc}\`.`);
  }
  lines.push(
    '',
    `<details><summary>${result.passed.length} passing check(s)</summary>`,
    '',
    ...result.passed.map((check) => `- \`${cell(check)}\``),
    '',
    '</details>',
    '',
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!['--target', '--report', '--baseline', '--summary'].includes(flag) || value === undefined) {
      throw new CanaryInputError(
        `unrecognised or incomplete argument "${flag}" (expected --target <name> --report <file> [--baseline <file>] [--summary <file>])`,
      );
    }
    options[flag.slice(2)] = value;
  }
  if (!options.target || !options.report) throw new CanaryInputError('usage: --target and --report are required');
  return options;
}

function readJson(file, what) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new CanaryInputError(`cannot read ${what} ${file}: ${error.message}`);
  }
}

export function main(argv, env = process.env) {
  const annotate = (message) => env.GITHUB_ACTIONS === 'true' && console.log(`::error title=MediaPipe canary::${message.replace(/\n/g, ' ')}`);
  let options;
  try {
    options = parseArgs(argv);
    const result = compareToBaseline({
      target: options.target,
      report: readJson(options.report, 'report'),
      baseline: readJson(options.baseline ?? DEFAULT_BASELINE, 'baseline'),
    });
    const summaryFile = options.summary ?? env.GITHUB_STEP_SUMMARY;
    if (summaryFile) appendFileSync(summaryFile, `${renderSummary(result)}\n`);
    console.log(`${result.status === 'green' ? 'GREEN' : 'RED'}: ${result.headline}`);
    for (const finding of result.findings) {
      console.log(`  ${finding.state === 'new' ? 'NEW     ' : 'accepted'}  ${finding.check}`);
    }
    for (const item of result.gone) console.log(`  GONE      ${item.check}`);
    if (result.status === 'red') {
      for (const reason of result.reasons) annotate(reason);
      return 1;
    }
    return 0;
  } catch (error) {
    if (!(error instanceof CanaryInputError)) throw error;
    console.error(`RED: the canary could not judge the scan: ${error.message}`);
    annotate(`the canary could not judge the scan: ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
