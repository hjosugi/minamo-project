<!-- i18n: language-switcher -->
[English](filter-response.md) | [日本語](filter-response.ja.md)

# Filter Response Baseline

Status: measured baseline for issue #270. Fixes the numbers a learned-filter
candidate has to beat. See
[../research/learned-smoothing-filters.md](../research/learned-smoothing-filters.md).

## Why this exists

Every smoothing filter trades jitter against lag. "The learned filter is
smoother" is therefore unfalsifiable on its own — any filter can be made
smoother by adding lag. #270 asks for the benchmark to be defined *before* a
candidate is evaluated, and this is it: jitter and lag are reported together, so
a candidate can be compared at equal lag rather than at its own preferred
operating point.

## How to reproduce

```
pnpm bench:filters          # table
pnpm bench:filters --json   # machine-readable
```

`scripts/bench-filter-response.mjs` is deterministic — a seeded PRNG for the
noise and a fixed 60 fps timebase — so this table is reproducible rather than a
sample of one run. It self-checks against reference filters before reporting and
exits non-zero if the metrics misbehave.

## Metrics

- **Jitter attenuation** — hold a constant value, add zero-mean noise, take the
  RMS of the output's *first difference*, and divide by the input's. 0.10 means
  90% of the visible shake removed. First difference rather than spread about
  the mean because what reads as jitter is frame-to-frame movement; a small
  steady offset looks fine.
- **Lag to 90%** — step from 0 to 1, time until the output reaches 0.9.
- **Overshoot** — any excursion past the step. One Euro is a cascade of
  first-order low passes toward the target, so it *cannot* overshoot and the
  baseline is 0 by construction. The column exists for the candidates: a Kalman
  filter with a learned motion model can overshoot, and jitter bought with
  overshoot is not a win.
- **0.5 Hz tracking RMSE** — follow a noisy sinusoid at about the rate of
  natural head movement, RMS error against the clean signal. This keeps the step
  column honest: a step is the harshest lag test but also the case that most
  rewards a large derivative gain (`beta`), because the cutoff spikes once and
  then the filter coasts.
- **Spike passthrough** — inject isolated one-frame outliers and report the worst
  output excursion as a fraction of the spike. 0.20 means a fifth of a bad
  landmark reached the avatar. This is the axis where One Euro's adaptive cutoff
  works against it: the cutoff is `minCutoff + beta * |dx/dt|`, and a one-frame
  outlier detonates the derivative estimate, so the filter opens up at exactly
  the moment it should clamp down. Nothing else in this table can see that —
  white noise and a jittery clock perturb the derivative, an outlier explodes
  it.

## Results

Measured 2026-07-30 at 60 fps, noise amplitude 0.02, 900 frames per case.

| Configuration | minCutoff | beta | jitter attenuation | lag to 90% (ms) | overshoot | 0.5 Hz tracking RMSE | spike passthrough |
|---|---|---|---|---|---|---|---|
| preset: responsive | 2.4 | 0.75 | 0.152 | 83 | 0.0% | 0.0363 | 0.278 |
| preset: balanced | 1.6 | 0.4 | 0.106 | 133 | 0.0% | 0.0545 | 0.193 |
| preset: smooth | 0.9 | 0.18 | 0.063 | 283 | 0.0% | 0.0913 | 0.113 |
| default: face (Face weights) | 1.6 | 0.4 | 0.106 | 133 | 0.0% | 0.0545 | 0.193 |
| default: headRotation (Head rotation) | 1.2 | 0.8 | 0.085 | 100 | 0.0% | 0.0583 | 0.212 |
| default: headPosition (Head position) | 1.0 | 0.3 | 0.070 | 200 | 0.0% | 0.0799 | 0.137 |
| default: pose (Upper-body pose) | 0.8 | 0.2 | 0.056 | 300 | 0.0% | 0.0976 | 0.108 |
| default: hands (Hands) | 1.8 | 0.5 | 0.118 | 117 | 0.0% | 0.0482 | 0.217 |

## Reading the table

The presets lie on the expected curve: lower `minCutoff` means less jitter and
more lag, monotonically. Spike passthrough tracks `beta` just as cleanly — at a
fixed `minCutoff` of 1.6 it rises from 0.144 at `beta` 0 to 0.276 at `beta` 1.2.

`headRotation` (1.2, 0.8) beats the `balanced` preset (1.6, 0.4) on both jitter
(0.085 vs 0.106) and step lag (100 vs 133 ms) — but it tracks sustained motion
slightly worse (0.0583 vs 0.0545) *and* passes through more of an outlier
(0.212 vs 0.193). It is a different point on the trade, not a better one. On the
first two columns alone it would have read as a strict improvement, which is what
the last two columns are for.

## The sweep: the tuning space has no free win

`pnpm bench:filters --sweep` scores 725 `(minCutoff, beta)` settings and asks
whether any dominates a shipped one — better or equal on every axis, strictly
better on at least one — under both a clean 60 fps clock and a hostile one
(noise 0.05, dt jitter ±25%).

**Measured on jitter, lag and tracking only, every shipped configuration is
dominated**, often heavily: `pose` (0.8, 0.2) appeared beatable by (0.4, 0.8) at
41% less jitter and 61% less lag. That result does not survive the spike column.
With outlier rejection counted, **nothing dominates any preset** — 0 of 725, for
all eight configurations.

The mechanism is the one described above: every apparent win came from raising
`beta`, and every raise in `beta` is paid for in outlier passthrough. The
(0.4, 0.8) setting that looked free for `pose` passes through 0.167 of a spike
against the incumbent's 0.108 — 55% more of a bad landmark reaching the avatar.
For `balanced`, (1.1, 1.2) costs 0.248 against 0.193.

So the shipped presets are Pareto-optimal on this benchmark. That is a stronger
statement about them than the earlier three-axis version of this table supported,
and it is worth stating plainly: a sweep that omits outlier behaviour will
"discover" large free gains that do not exist.

Still untested, and the reason this is not proof: the noise model is white and
the motion model is a single sinusoid, whereas real landmark noise is
temporally correlated; and lower numbers on four synthetic axes are not the same
as looking better on camera, which is what One Euro tuning is ultimately judged
on.

## The bar for a candidate filter

To count as an improvement, a candidate must, on this harness:

1. beat a baseline row's jitter attenuation **at that row's lag** — not at a
   longer one;
2. keep overshoot at or near 0, since the incumbent's is 0 by construction;
3. not regress the 0.5 Hz tracking RMSE for the same row;
4. not regress spike passthrough — this is the one the tuning space cannot buy,
   so it is where a learned filter has something to offer;
5. remain causal, i.e. emit frame *n* using only frames up to *n*.

Criterion 5 disqualifies window-based smoothers regardless of their scores; see
the research note for which candidates that rules out.
