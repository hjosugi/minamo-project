# Drum Benchmark Metrics

Status: implemented benchmark definitions for issues #121 and #123.

The local runner for #234 is documented in
[drum-benchmark-runner.md](drum-benchmark-runner.md).

## Clip Set

Minimum local clip set:

- single snare hits at 60 bpm
- alternating left/right snare hits at 120 bpm
- fast roll at 180-220 bpm
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

The runner also records mean and p95 absolute timing error, zone accuracy, and
hand-assignment accuracy for matched events.

Default timing tolerance is 35 ms. Fast-roll tests additionally require a per-zone minimum separation of 35 ms to detect double-trigger regressions.

## Pass Gates

- single hit: recall 1.0, precision 1.0
- alternating hands: recall >= 0.95, hand assignment >= 0.9
- fast roll: recall >= 0.9, false double hits = 0
- false-positive hold: detected = 0
