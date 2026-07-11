<!-- i18n: language-switcher -->
[English](motion-delta-quantization.md) | [日本語](motion-delta-quantization.ja.md)

# Motion Delta Quantization Design

Status: implemented design for issue #161. Related: #41, KGM2 protocol draft.

Motion frames are the streamed half of compression: ~76 bytes/frame instead of
video. This document specifies how KGM motion deltas are quantized and provides
a reference codec, complementing the motion section of
[avatar-compression.md](avatar-compression.md) and
[../PROTOCOL_V2_DRAFT.md](../PROTOCOL_V2_DRAFT.md).

## Steps

1. Encode a keyframe first, then stream deltas from the last keyframe.
2. Quantize per channel class:
   - face expression weights: 8-bit normalized deltas from the last keyframe
   - head rotation: shortest-path quaternion delta, 12-16 bits per component
   - hand curls/spreads: 8-bit normalized values after rig clamps
   - drum hits: event packet only; never stream idle drum state
3. Force a keyframe after reconnect, model change, or 2 seconds of continuous
   deltas.
4. Drop deltas that arrive after a newer keyframe.

The reference codec lives in [`shared/motion-quant.js`](../../shared/motion-quant.js):
`quantizeWeightDeltas`, `dequantizeWeightDeltas`, `encodeMotionFrame`,
`decodeMotionStream`, and `shouldForceKeyframe`.

## Rig-breaking risks

- Too-coarse expression quantization causes visible mouth/blink drift on a
  neutral face; the codec keeps neutral round-trips below one visible step.
- Quaternion delta without shortest-path handling flips head orientation across
  the ±180° boundary.
- Applying a stale delta on top of a new keyframe corrupts state; the decoder
  discards out-of-order deltas.

## Test method

- `pnpm test` covers the reference codec: neutral round-trip has no visible
  drift, gaze error stays under 3° after delta decode, a reconnect keyframe
  restores full state in one frame, and stale deltas after a keyframe are
  dropped.
- Quantization acceptance gates are enforced as assertions, so a regression in
  the codec fails the suite.
