<!-- i18n: language-switcher -->
[English](drum-benchmark-metrics.md) | [日本語](drum-benchmark-metrics.ja.md)

# Drum Benchmark Metrics

Status: implemented benchmark definitions for issues #121 and #123.

The local runner for #234 is documented in
[drum-benchmark-runner.md](drum-benchmark-runner.md).

## Clip Set

Minimum local clip set:

- single snare hits at 60 bpm
- alternating left/right snare hits at 120 bpm
- fast roll at 180-220 bpm (16th notes: 75 ms apart at 200 bpm)
- **roll stress at 220 bpm 32nd notes** — 34.1 ms apart, below the separation
  window; this is the clip that reaches the ceiling
- double-trigger regression: one real stroke plus a spurious re-trigger
- hi-hat eighth notes with pedal close
- kick-only audio impulses
- false-positive hold: sticks resting inside a zone

Raw video and audio stay local unless the contributor explicitly opts in to sharing.

## Metrics

`scoreDrumBenchmark(expectedHitTimesMs, detectedHits)` reports:

- expected hit count
- detected hit count
- matched hits within a tolerance window
- precision
- recall
- false double hits per zone

The runner also records mean and p95 absolute timing error, zone accuracy,
hand-assignment accuracy for matched events, and `minDetectedSeparationMs` — the
smallest gap between two detections on the same zone.

Default timing tolerance is 35 ms, with a per-zone minimum separation of 35 ms
used to detect double-trigger regressions.

## What the separation window does and does not mean

A pair of same-zone detections closer than `minimumSeparationMs` counts as a
false double **only when it is not backed by two distinct expected hits.** A real
roll legitimately puts strokes closer together than the window: 32nd notes at
220 bpm are 34.1 ms apart, which is inside it. Counting those as double-triggers
made "fast roll: false double hits = 0" unreachable by construction rather than
by detector accuracy, so the clip set's own 220 bpm upper bound could not pass
(#123).

`minDetectedSeparationMs` is informational, not a gate. Read it to confirm a roll
clip reached the rate it claims: a clip whose minimum separation never drops
below `minimumSeparationMs` has not exercised the roll path at all.

The detector side has the matching change. A zone re-arms on the **rebound** —
the tip lifting `DRUM_REARM_MIN_LIFT_M` (12 mm) clear of where the last hit
fired — rather than only on `cooldownMs`. A stick cannot strike twice without
lifting, so this admits genuine double strokes while still rejecting threshold
jitter, which oscillates well under a centimetre. The cooldown stays as the
fallback when no lift is observed. Without it, one zone is capped at
1000/`cooldownMs` hits per second — 22 at 45 ms — before the camera's own limit
(15 Hz at 30 fps, 30 Hz at 60 fps) even applies.

## Pass Gates

- single hit: recall 1.0, precision 1.0
- alternating hands: recall >= 0.95, hand assignment >= 0.9
- fast roll: recall >= 0.9, false double hits = 0
- roll stress (`fast-roll-32nd`): recall >= 0.9, false double hits = 0, and
  `minDetectedSeparationMs` < `minimumSeparationMs`
- double-trigger regression: false double hits = 1
- false-positive hold: detected = 0
