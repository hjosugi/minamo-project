# Hi-Hat Pedal Inference Design

Status: implemented design for issue #118. Part of the drum performance system
([drum-performance-tracking.md](drum-performance-tracking.md)).

## Goal

Infer hi-hat pedal open/close state from a single webcam plus microphone,
without a MIDI pedal, and expose it as a normalized `0..1` openness signal plus
optional chick events.

## Signals

Foot motion is hard to see with one webcam, so the pedal is inferred from a
fusion of:

- audio onset energy in the hi-hat band (bright, high-frequency transients)
- pose-based ankle/knee vertical motion when the lower body is visible
- manual pedal-zone calibration as a fallback anchor

The reference helper is `inferHiHatPedalState(onsets, timeMs, windowMs)` in
[`src/core/drum.ts`](../../src/core/drum.ts). It selects the strongest onset
above ~1.8 kHz inside the window and returns a clamped strength, so a closed
"chick" reads as a short openness dip followed by an onset spike.

## False-positive mitigation

- Require a bright-band onset; low-frequency energy (kick/tom) is rejected by the
  frequency predicate.
- Ignore onsets outside the time window around the visual/pedal event.
- When no audio onset exists, hold the last calibrated openness rather than
  inventing a transition.

## Audio-sync design

Audio onsets are the primary timing signal for the pedal because feet are only
partially visible. Visual pose motion adjusts confidence but does not set the
event time; the onset timestamp does. This matches
[DD-003](../design/DD-003-audio-lipsync.md) latency handling.

## Benchmark method

- Hi-hat eighth-note clips with pedal close in the benchmark set
  ([../benchmarks/drum-benchmark-metrics.md](../benchmarks/drum-benchmark-metrics.md),
  fixture `tests/fixtures/drum-benchmark-clips.json`).
- Metrics: onset-to-openness latency, false chick rate during open playing.
- `npm test` covers `inferHiHatPedalState` selecting bright-band onsets and
  rejecting low-frequency energy.
