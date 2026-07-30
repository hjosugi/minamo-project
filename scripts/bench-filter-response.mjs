#!/usr/bin/env node
// Filter response benchmark: jitter, lag, and overshoot for the One Euro presets
// (#270).
//
// #270 asks for the benchmark to be defined *before* any learned filter is
// evaluated, and for the current presets to be scored so the baseline is fixed.
// Without that, "the learned filter is smoother" is unfalsifiable — every
// smoothing filter trades jitter for lag, so a jitter win at unstated lag is not
// a result. This harness reports both, which is what makes a candidate
// comparable "at equal lag".
//
// Everything here is deterministic: a seeded PRNG for the noise and a fixed
// 60 fps timebase, so the committed table in docs/benchmarks/filter-response.md
// is reproducible rather than a sample of one run.
//
// Run: pnpm bench:filters   (add --json for machine-readable output)
import { OneEuroFilter } from '../shared/filters.js';
import { FILTER_PRESETS, DEFAULT_SMOOTHING_SETTINGS, SMOOTHING_GROUPS } from '../shared/runtime.js';

const FPS = 60;
const DT = 1 / FPS;

/** mulberry32 — small, seeded, and good enough for additive sensor noise. */
function createRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Jitter at rest: hold a constant value, add zero-mean noise, and measure the
 * RMS of the output's first difference. First difference rather than variance
 * about the mean because what a viewer sees as jitter is frame-to-frame
 * *movement*, not spread — a filter with a small steady offset looks fine.
 *
 * Returned as attenuation (output jitter / input jitter), so 0.10 means "90% of
 * the visible shake removed" independent of the noise amplitude chosen here.
 */
function measureJitter(makeFilter, { frames = 900, value = 0.5, noise = 0.02, seed = 12345, dtJitter = 0 } = {}) {
  const random = createRandom(seed);
  const filter = makeFilter();
  const inputs = [];
  const outputs = [];
  let t = 0;
  for (let i = 0; i < frames; i++) {
    const raw = value + (random() * 2 - 1) * noise;
    inputs.push(raw);
    outputs.push(filter.filter(raw, t));
    t += DT * (1 + (random() * 2 - 1) * dtJitter);
  }
  // Skip the first 10% so the filter's warm-up does not count as jitter.
  const start = Math.floor(frames * 0.1);
  return {
    inputJitter: firstDifferenceRms(inputs, start),
    outputJitter: firstDifferenceRms(outputs, start),
    attenuation: firstDifferenceRms(outputs, start) / firstDifferenceRms(inputs, start),
  };
}

function firstDifferenceRms(series, start) {
  let sum = 0;
  let n = 0;
  for (let i = Math.max(1, start); i < series.length; i++) {
    const d = series[i] - series[i - 1];
    sum += d * d;
    n += 1;
  }
  return n ? Math.sqrt(sum / n) : 0;
}

/**
 * Step response: hold 0, step to 1, and measure how long the output takes to
 * reach 90% of the step, plus any excursion past it.
 *
 * One Euro is a cascade of first-order low passes toward the target, so it
 * cannot overshoot; the baseline is 0 by construction. The metric exists for the
 * candidates — a Kalman filter with a learned motion model can and does
 * overshoot, and a jitter win paid for in overshoot is not a win.
 */
function measureStepResponse(makeFilter, { settleFrames = 120, stepFrames = 240 } = {}) {
  const filter = makeFilter();
  let t = 0;
  for (let i = 0; i < settleFrames; i++) {
    filter.filter(0, t);
    t += DT;
  }
  let lagMs = null;
  let peak = 0;
  for (let i = 0; i < stepFrames; i++) {
    const out = filter.filter(1, t);
    t += DT;
    if (out > peak) peak = out;
    if (lagMs === null && out >= 0.9) lagMs = (i + 1) * DT * 1000;
  }
  return {
    lagMs,
    reached90: lagMs !== null,
    overshootPct: Math.max(0, (peak - 1) * 100),
  };
}

/**
 * Tracking error under continuous motion: follow a noisy 0.5 Hz sinusoid (about
 * the rate of natural head movement) and report RMS error against the clean
 * signal.
 *
 * This is here to keep the step-response column honest. A step is the harshest
 * lag test but it is also the case that most rewards a large derivative gain
 * (`beta`), because the cutoff spikes exactly once and then the filter coasts.
 * Real motion is not a step, so a configuration that wins on lag by leaning on
 * beta has to show it can also track without amplifying noise.
 */
function measureTracking(makeFilter, { frames = 900, amplitude = 0.3, hz = 0.5, noise = 0.02, seed = 6789, dtJitter = 0 } = {}) {
  const random = createRandom(seed);
  const filter = makeFilter();
  let sum = 0;
  let n = 0;
  let t = 0;
  const start = Math.floor(frames * 0.1);
  for (let i = 0; i < frames; i++) {
    const clean = 0.5 + amplitude * Math.sin(2 * Math.PI * hz * t);
    const out = filter.filter(clean + (random() * 2 - 1) * noise, t);
    t += DT * (1 + (random() * 2 - 1) * dtJitter);
    if (i >= start) {
      const error = out - clean;
      sum += error * error;
      n += 1;
    }
  }
  return { trackingRmse: n ? Math.sqrt(sum / n) : 0 };
}

/**
 * Spike rejection: hold a constant value and inject isolated one-frame outliers.
 * Reports the worst output excursion as a fraction of the spike, so 0.30 means a
 * third of a bad landmark reached the avatar.
 *
 * This is the failure mode a large `beta` should have. One Euro's adaptive cutoff
 * is minCutoff + beta * |dx/dt|, and a single-frame outlier produces a huge
 * derivative estimate — so exactly when the filter should reject a sample hardest
 * it opens up instead. The other scenarios cannot see this: white noise and a
 * jittery clock perturb the derivative, an outlier detonates it.
 */
function measureSpikeRejection(makeFilter, { frames = 600, value = 0.5, spike = 0.3, everyN = 60 } = {}) {
  const filter = makeFilter();
  let worst = 0;
  for (let i = 0; i < frames; i++) {
    const isSpike = i > 0 && i % everyN === 0;
    const out = filter.filter(value + (isSpike ? spike : 0), i * DT);
    // Measure on the spike frame and the two after it, which is where the
    // inflated cutoff keeps letting the excursion through.
    if (i > everyN / 2 && i % everyN <= 2) {
      worst = Math.max(worst, Math.abs(out - value) / spike);
    }
  }
  return { spikePassthrough: worst };
}

function scoreFilter(makeFilter) {
  return {
    ...measureJitter(makeFilter),
    ...measureStepResponse(makeFilter),
    ...measureTracking(makeFilter),
    ...measureSpikeRejection(makeFilter),
  };
}

/**
 * Reference filters with known behaviour. If the metrics above are wrong, these
 * are what catch it: a pass-through must show no smoothing and no lag, and a
 * fixed heavy EMA must show a lot of both. A harness that cannot fail is not
 * evidence.
 */
function selfCheck() {
  const identity = () => ({ filter: (v) => v });
  const heavyEma = () => {
    let y = null;
    return { filter: (v) => (y = y === null ? v : 0.02 * v + 0.98 * y) };
  };
  const failures = [];

  // Pin what firstDifferenceRms *means*, not just that it behaves monotonically.
  // Every end-to-end check below is a ratio, and a metric that measured spread
  // about the mean instead of frame-to-frame movement would satisfy all of them
  // while reporting different numbers — a slow ramp has large spread and almost
  // no jitter. These three cases separate the two.
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const constant = Array.from({ length: 100 }, () => 0.5);
  if (!near(firstDifferenceRms(constant, 0), 0)) {
    failures.push(`a constant series has no jitter, got ${firstDifferenceRms(constant, 0)}`);
  }
  const ramp = Array.from({ length: 100 }, (_, i) => 0.5 + i * 0.01);
  if (!near(firstDifferenceRms(ramp, 0), 0.01)) {
    failures.push(`a ramp's jitter is its step (0.01), got ${firstDifferenceRms(ramp, 0)}`);
  }
  const alternating = Array.from({ length: 100 }, (_, i) => 0.5 + (i % 2 ? 0.03 : -0.03));
  if (!near(firstDifferenceRms(alternating, 0), 0.06)) {
    failures.push(`alternating +/-0.03 has jitter 0.06, got ${firstDifferenceRms(alternating, 0)}`);
  }

  // The warm-up skip has to actually be applied: a filter that settles late is
  // identity afterwards, so its steady-state jitter must match its input. If the
  // startup transient is counted, this reads as amplification.
  const lateSettling = () => {
    let n = 0;
    return { filter: (v) => (n++ < 30 ? 0 : v) };
  };
  const late = measureJitter(lateSettling);
  if (Math.abs(late.attenuation - 1) > 1e-6) {
    failures.push(`a settled pass-through must show no net jitter change, got ${late.attenuation}`);
  }

  const id = scoreFilter(identity);
  if (Math.abs(id.attenuation - 1) > 1e-9) failures.push(`pass-through must not attenuate jitter, got ${id.attenuation}`);
  if (id.lagMs !== DT * 1000) failures.push(`pass-through must reach the step immediately, got ${id.lagMs} ms`);
  if (id.overshootPct !== 0) failures.push(`pass-through must not overshoot, got ${id.overshootPct}`);

  const ema = scoreFilter(heavyEma);
  if (!(ema.attenuation < 0.2)) failures.push(`a heavy EMA must remove most jitter, got ${ema.attenuation}`);
  if (!(ema.lagMs > id.lagMs * 10)) failures.push(`a heavy EMA must lag far more than a pass-through, got ${ema.lagMs} ms`);
  if (ema.overshootPct !== 0) failures.push(`a first-order EMA cannot overshoot, got ${ema.overshootPct}`);
  if (!(id.trackingRmse < 0.02)) failures.push(`pass-through error must be the noise alone, got ${id.trackingRmse}`);
  if (!(ema.trackingRmse > id.trackingRmse * 3)) failures.push(`a heavy EMA must lag a sinusoid badly, got ${ema.trackingRmse}`);

  // Monotonicity: within one filter family, more smoothing must mean both less
  // jitter and more lag. If the two metrics ever move together, one is broken.
  const loose = scoreFilter(() => new OneEuroFilter({ minCutoff: 4, beta: 0.4, dCutoff: 1 }));
  const tight = scoreFilter(() => new OneEuroFilter({ minCutoff: 0.4, beta: 0.4, dCutoff: 1 }));
  if (!(tight.attenuation < loose.attenuation)) {
    failures.push(`a lower cutoff must attenuate more (${tight.attenuation} vs ${loose.attenuation})`);
  }
  if (!(tight.lagMs > loose.lagMs)) {
    failures.push(`a lower cutoff must lag more (${tight.lagMs} vs ${loose.lagMs} ms)`);
  }
  return failures;
}

const failures = selfCheck();
if (failures.length) {
  console.error('filter-response self-check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const rows = [];
for (const [name, preset] of Object.entries(FILTER_PRESETS)) {
  rows.push({ label: `preset: ${name}`, opts: preset, ...scoreFilter(() => new OneEuroFilter(preset)) });
}
for (const [group, settings] of Object.entries(DEFAULT_SMOOTHING_SETTINGS)) {
  const opts = { minCutoff: settings.minCutoff, beta: settings.beta, dCutoff: 1.0 };
  rows.push({
    label: `default: ${group} (${SMOOTHING_GROUPS[group] || group})`,
    opts,
    ...scoreFilter(() => new OneEuroFilter(opts)),
  });
}

/**
 * Sweep (minCutoff, beta) and ask whether any setting dominates a shipped one —
 * better or equal on all three axes and strictly better on at least one (#270).
 *
 * Three-way dominance rather than the jitter/lag pair alone, because leaning on
 * beta buys both of those and is paid for in sustained-motion tracking. A "free
 * win" that quietly degrades tracking is not free, it is just a differently
 * tuned trade. Lag is quantized to the 16.7 ms frame, so ties are common and
 * compared with >=.
 */
function sweep() {
  const candidates = [];
  for (let minCutoff = 0.4; minCutoff <= 3.201; minCutoff += 0.1) {
    for (let beta = 0; beta <= 1.201; beta += 0.05) {
      const opts = { minCutoff: round(minCutoff, 2), beta: round(beta, 2), dCutoff: 1.0 };
      candidates.push({ opts, ...scoreBothScenarios(() => new OneEuroFilter(opts)) });
    }
  }
  return candidates.filter((c) => c.nominal.reached90 && c.hostile.reached90);
}

/**
 * The nominal scenario is a perfect 60 fps clock and light noise — which happens
 * to be the condition that most flatters a large `beta`, because the derivative
 * estimate is clean and dividing by an exact dt never inflates it. Real capture
 * has neither. The hostile scenario adds noisier landmarks and a 25% jittery
 * frame clock, exactly where a high derivative gain should fail: One Euro
 * computes the derivative as (x - xPrev) / dt, so clock jitter feeds straight
 * into the adaptive cutoff.
 *
 * A setting only counts as an improvement if it dominates under BOTH. Otherwise
 * the sweep is just discovering the bias of its own noise model.
 */
const HOSTILE = { noise: 0.05, dtJitter: 0.25 };

function scoreBothScenarios(makeFilter) {
  const step = measureStepResponse(makeFilter);
  const spike = measureSpikeRejection(makeFilter);
  return {
    nominal: { ...measureJitter(makeFilter), ...measureTracking(makeFilter), ...step, ...spike },
    hostile: {
      ...measureJitter(makeFilter, { ...HOSTILE, seed: 24680 }),
      ...measureTracking(makeFilter, { ...HOSTILE, seed: 13579 }),
      ...step,
      ...spike,
    },
  };
}

function round(value, places) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

/** Strictly better on one axis, no worse on any. Epsilon guards float noise. */
function dominates(candidate, incumbent, eps = 1e-6) {
  const better =
    candidate.attenuation < incumbent.attenuation - eps ||
    candidate.lagMs < incumbent.lagMs - eps ||
    candidate.trackingRmse < incumbent.trackingRmse - eps ||
    candidate.spikePassthrough < incumbent.spikePassthrough - eps;
  const noWorse =
    candidate.attenuation <= incumbent.attenuation + eps &&
    candidate.lagMs <= incumbent.lagMs + eps &&
    candidate.trackingRmse <= incumbent.trackingRmse + eps &&
    candidate.spikePassthrough <= incumbent.spikePassthrough + eps;
  return better && noWorse;
}

if (process.argv.includes('--sweep')) {
  const candidates = sweep();
  console.log(`# One Euro (minCutoff, beta) sweep — ${candidates.length} settings, ${FPS} fps\n`);
  console.log('Dominating = better or equal on jitter, step lag AND 0.5 Hz tracking, strictly');
  console.log('better on at least one -- under BOTH a clean 60 fps clock and a hostile one');
  console.log(`(noise ${HOSTILE.noise}, dt jitter +/-${HOSTILE.dtJitter * 100}%).\n`);
  for (const row of rows) {
    const incumbent = scoreBothScenarios(() => new OneEuroFilter(row.opts));
    const nominalOnly = candidates.filter((c) => dominates(c.nominal, incumbent.nominal));
    const bothScenarios = nominalOnly
      .filter((c) => dominates(c.hostile, incumbent.hostile))
      .sort((a, b) => a.nominal.attenuation - b.nominal.attenuation);
    const label = `**${row.label}** (${row.opts.minCutoff}, ${row.opts.beta})`;
    if (!bothScenarios.length) {
      console.log(
        `- ${label} — survives: ${nominalOnly.length} setting(s) dominate on the clean clock, ` +
          `**0 under the hostile one**.`,
      );
      continue;
    }
    const best = bothScenarios[0];
    console.log(
      `- ${label}: ${bothScenarios.length} of ${nominalOnly.length} clean-clock winners hold up. ` +
        `Best: (${best.opts.minCutoff}, ${best.opts.beta}) → ` +
        `atten ${incumbent.nominal.attenuation.toFixed(3)}→${best.nominal.attenuation.toFixed(3)}, ` +
        `lag ${incumbent.nominal.lagMs.toFixed(0)}→${best.nominal.lagMs.toFixed(0)} ms, ` +
        `RMSE ${incumbent.nominal.trackingRmse.toFixed(4)}→${best.nominal.trackingRmse.toFixed(4)}, ` +
        `spike ${incumbent.nominal.spikePassthrough.toFixed(3)}→${best.nominal.spikePassthrough.toFixed(3)}`,
    );
  }
} else if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ fps: FPS, rows }, null, 2));
} else {
  console.log(`# One Euro filter response baseline (${FPS} fps, seeded noise, deterministic)\n`);
  console.log('| Configuration | minCutoff | beta | jitter attenuation | lag to 90% (ms) | overshoot | 0.5 Hz tracking RMSE | spike passthrough |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const row of rows) {
    const lag = row.reached90 ? `${row.lagMs.toFixed(0)}` : '>4000';
    console.log(
      `| ${row.label} | ${row.opts.minCutoff} | ${row.opts.beta} | ${row.attenuation.toFixed(3)} | ${lag} | ${row.overshootPct.toFixed(1)}% | ${row.trackingRmse.toFixed(4)} | ${row.spikePassthrough.toFixed(3)} |`,
    );
  }
  console.log('\nJitter attenuation is output/input RMS of the first difference at rest;');
  console.log('lower is smoother. Lag is the step response to 90%. A candidate filter must');
  console.log('beat a row on jitter *at that row\'s lag* to count as an improvement (#270).');
}
