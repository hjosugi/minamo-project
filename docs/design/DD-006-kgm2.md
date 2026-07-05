# DD-006: KGM2 Protocol

Status: reference implementation. Backlog: KGM-027, KGM-028, KGM-029.
Supersedes nothing; KGM1 remains valid and relays never need to understand
either.

## Motivation

KGM1 is deliberately naive: fixed layout, absolute values every frame. With
hands (DD-001) and richer body data the per-frame quaternion count grows,
and long idle stretches waste bytes. KGM2 targets ~2x reduction while
keeping the core property: loss is cheap.

## Changes

### 1. Smallest-three quaternions (KGM-027)

A unit quaternion's largest component is recoverable from the other three.
Encode: 2 bits for the largest-component index + 3 x 10 bits signed for the
remaining components scaled by 1/sqrt(2). 32 bits total vs 64 in KGM1.
Max angular error ~0.3 deg, below webcam tracking noise.

### 2. Delta frames with keyframes (KGM-028)

- Keyframe every K frames (default K=30, i.e. twice per second at 60 fps):
  identical to an absolute KGM2 frame.
- Delta frame: per-channel signed deltas against the last keyframe (not the
  previous frame) as i8 with a 2x range scale; channels exceeding i8 range
  force that channel into an escape list of absolute values.
- Basing deltas on the last keyframe (not previous frame) means loss inside
  an interval degrades nothing: every delta is independently decodable once
  its keyframe arrived. Loss of a keyframe degrades until the next one
  (<= 500 ms), matching the reliability class of the transport.
- Header gains: u16 keyframe id; delta frames reference it explicitly so a
  decoder never applies a delta to the wrong base.

### 3. Sparse channel mask (KGM-029)

7-byte (56-bit) presence mask over the 52 face channels; unlisted channels
hold their keyframe value. Combined with deltas, an idle face frame is
header + mask + a few bytes.

### 4. Reserved blocks

Block bits 2-5 reserved: HAND (DD-001), GAZE (KGM-016 true gaze vector),
SOURCE (u16 source id for collab rooms, KGM-043), AUX.

## Format sketch

```
header:  magic u16 | ver=2 u8 | blocks u8 | t u32 | seq u16 | kf_id u16
FACE-K:  quat s3 u32 | pos i16x3 | weights u8x52
FACE-D:  quat s3 u32 | pos delta i8x3 | mask 7B | deltas i8xN | esc u8 + pairs
```

The current JS reference narrows `blocks` to a `frame_type` byte:
`1 = keyframe`, `2 = delta`. Delta frames use the fixed 7-byte channel mask
and omit the escape list; a channel delta outside i8 range forces a keyframe.
This keeps the first shipped profile simple and deterministic while preserving
the same wire-level recovery rule.

## Compatibility

Version byte gates everything. Encoders can emit KGM1 or KGM2 per session;
the viewer decodes both. Golden vectors from the JS reference (KGM-031)
freeze the format before the version ships.

## Validation targets

- Max smallest-three quaternion angular error < 0.5 deg over 1M random
  rotations.
- JS smallest-three encode+decode < 1 us per quaternion.
- >= 35% mean size reduction on recorded corpora (KGM-047 fixtures).
- 10% uniform loss recovers within one keyframe interval.

## Implementation evidence

- Codec: `shared/kgm2.js`
- Tests: `tests/run-tests.mjs`
- Reference-codec notes: `docs/transport/kgm2-reference-codecs.md`

The regression suite verifies the 1M quaternion accuracy gate, a timed JS
encode/decode loop, sparse-channel hold semantics, idle deltas below 30 bytes,
rejection of deltas without a base keyframe, and recovery after a dropped
keyframe at the next keyframe interval.
