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

## Results

Measured 2026-07-30 at 60 fps, noise amplitude 0.02, 900 frames per case.

| Configuration | minCutoff | beta | jitter attenuation | lag to 90% (ms) | overshoot | 0.5 Hz tracking RMSE |
|---|---|---|---|---|---|---|
| preset: responsive | 2.4 | 0.75 | 0.152 | 83 | 0.0% | 0.0361 |
| preset: balanced | 1.6 | 0.4 | 0.106 | 133 | 0.0% | 0.0543 |
| preset: smooth | 0.9 | 0.18 | 0.063 | 283 | 0.0% | 0.0911 |
| default: face (Face weights) | 1.6 | 0.4 | 0.106 | 133 | 0.0% | 0.0543 |
| default: headRotation (Head rotation) | 1.2 | 0.8 | 0.085 | 100 | 0.0% | 0.0581 |
| default: headPosition (Head position) | 1.0 | 0.3 | 0.070 | 200 | 0.0% | 0.0798 |
| default: pose (Upper-body pose) | 0.8 | 0.2 | 0.056 | 300 | 0.0% | 0.0974 |
| default: hands (Hands) | 1.8 | 0.5 | 0.118 | 117 | 0.0% | 0.0481 |

## Reading the table

The presets lie on the expected curve: lower `minCutoff` means less jitter and
more lag, monotonically.

The interesting row is **headRotation (1.2, 0.8)**, which beats the `balanced`
preset (1.6, 0.4) on *both* jitter (0.085 vs 0.106) and step lag (100 vs 133 ms)
— while tracking the sinusoid slightly worse (0.0581 vs 0.0543). So it is not
free: `beta` buys step responsiveness and at-rest smoothness together, and the
bill arrives as tracking error during sustained motion, where `minCutoff`
dominates. Had this table carried only the step column it would have read as a
strict improvement, which is why the tracking column is there.

That also means the `(minCutoff, beta)` space is not fully explored by the three
presets. A sweep with this harness is nearly free and should happen before any
neural network is proposed for a 60 fps loop (#270).

## The bar for a candidate filter

To count as an improvement, a candidate must, on this harness:

1. beat a baseline row's jitter attenuation **at that row's lag** — not at a
   longer one;
2. keep overshoot at or near 0, since the incumbent's is 0 by construction;
3. not regress the 0.5 Hz tracking RMSE for the same row;
4. remain causal, i.e. emit frame *n* using only frames up to *n*.

Criterion 4 disqualifies window-based smoothers regardless of their scores; see
the research note for which candidates that rules out.
