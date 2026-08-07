<!-- i18n: language-switcher -->
[English](drum-kick-pedal.md) | [日本語](drum-kick-pedal.ja.md)

# Kick Pedal Inference Design

Status: implemented design for issue #119. Part of the drum performance system
([drum-performance-tracking.md](drum-performance-tracking.md)).

## Goal

Generate a `DrumHitEvent` for the kick drum from a single webcam plus
microphone, where the beater and foot are usually occluded by the kit.

## Signals

- low-frequency audio onset energy (the kick fundamental, below ~160 Hz)
- pose-based knee/foot dip when the lower body is visible
- manual kick-zone calibration as a fallback anchor

The reference helper is `inferKickPedalHit(onsets, timeMs, windowMs, foot?)` in
[`src/core/drum.ts`](../../src/core/drum.ts). It selects the strongest onset
below ~160 Hz in the window and emits a `kick` `DrumHitEvent` with
`audioAligned: true`.

The optional `foot` argument supplies the pose-based half of the design via
`scoreFootPedalPress`. It adjusts confidence and never `timeNs`: the beater is
usually behind the kit, so a visually-derived kick time would be worse than the
onset it replaced.

`scoreFootPedalPress` reports `pressing` and `observed` separately, and the
distinction is the point. A foot the model cannot see (visibility below
`FOOT_PEDAL_MIN_VISIBILITY`) is evidence of *nothing* and leaves confidence
untouched. A foot that is clearly visible and clearly still under a
low-frequency onset is evidence *against* the kick, and lowers it.

Foot landmarks do not cross the wire. The KGM1 POSE block carries seven
upper-body points and no feet, so a caller reads them from the pose model's
local landmark array; carrying feet in the protocol is a separate decision.

## False-positive mitigation

- Require a low-frequency onset; bright-band energy (hi-hat/snare) is rejected.
- Enforce the same per-zone cooldown as visual hits so a single kick cannot
  produce two events.
- Emit nothing when there is no qualifying onset, rather than guessing from pose
  alone. A foot press with no onset produces no event at all.
- Discount a low-frequency onset that a visible, still foot contradicts. This is
  the floor-tom-read-as-kick case. It is a discount rather than a rejection
  because a beater can move with very little ankle travel.

## Audio-sync design

The kick is audio-first: the onset timestamp sets `timeNs`, and pose motion only
raises confidence. This keeps kick timing tight even though the pedal is not
visible, consistent with [DD-003](../design/DD-003-audio-lipsync.md).

## Benchmark method

- Kick-only impulse clips and kick+snare patterns in the benchmark set
  ([../benchmarks/drum-benchmark-metrics.md](../benchmarks/drum-benchmark-metrics.md)).
- Metrics: kick timing error, false kick rate under loud snare playing.
- `pnpm test` covers `inferKickPedalHit` emitting a `kick` event for a
  low-frequency onset and rejecting bright-band onsets.
