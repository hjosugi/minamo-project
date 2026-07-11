<!-- i18n: language-switcher -->
[English](PROTOCOL.md) | [日本語](PROTOCOL.ja.md)

# KGM1 Wire Protocol Specification

Version 1. Status: implemented in `shared/codec.js`.

Terminology used below is defined in [GLOSSARY.md](GLOSSARY.md).

## Design goals

- One tracking frame fits in one QUIC datagram (< 1200 bytes MTU). No fragmentation.
- Stateless per frame. Any frame can be decoded alone. A dropped frame costs nothing.
- Model-agnostic. Channels use a fixed canonical order, not MediaPipe output order.
- Cheap to encode and decode. No varint, no compression pass on the hot path.

## Framing

All integers are little-endian.

### Header (10 bytes)

| Offset | Size | Type | Field | Notes |
|---|---|---|---|---|
| 0 | 2 | u16 | magic | `0x4B47` ("KG") |
| 2 | 1 | u8 | version | `1` |
| 3 | 1 | u8 | blocks | bit 0: FACE, bit 1: POSE, bit 2: HANDS |
| 4 | 4 | u32 | timestamp | milliseconds, wraps at 2^32 |
| 8 | 2 | u16 | seq | wraps at 2^16, for loss and reorder stats |

### FACE block (66 bytes, present if bit 0 set)

| Size | Type | Field | Quantization |
|---|---|---|---|
| 8 | i16 x4 | head quaternion (x, y, z, w) | `round(v * 32767)`, clamped |
| 6 | i16 x3 | head position (x, y, z) | meters -> millimeters, i16 |
| 52 | u8 x52 | blendshape weights | `round(v * 255)`, v in [0, 1] |

Blendshape channel order is the ARKit 52 list defined in
`shared/blendshapes.js` (`ARKIT_52`). Encoders MUST map their model's
outputs into this order by name. Channels a model cannot produce are 0.

### POSE block (43 bytes, present if bit 1 set)

| Size | Type | Field | Notes |
|---|---|---|---|
| 1 | u8 | point count | currently 7 |
| 42 | i16 x21 | points (x, y, z) x7 | meters -> millimeters, hip-centered |

Point order: nose, leftShoulder, rightShoulder, leftElbow, rightElbow,
leftWrist, rightWrist (`POSE_POINTS` in `shared/blendshapes.js`).

### HANDS block (1 + 16 bytes/hand, present if bit 2 set)

This is the compact hand target block used by the browser tracker/viewer path.
It carries avatar-ready finger targets rather than raw landmarks.

| Size | Type | Field | Notes |
|---|---|---|---|
| 1 | u8 | hand count | 0-2 |
| 1 | u8 | flags | bit 0 calibrated, bit 1 short recovery hold |
| 1 | u8 | handedness | 0 = Left, 1 = Right |
| 1 | u8 | confidence | `round(v * 255)`, v in [0, 1] |
| 5 | u8 x5 | finger curls | thumb, index, middle, ring, pinky |
| 5 | i8 x5 | finger spreads | radians-ish, `round(v * 64)`, clamped |
| 3 | i8 x3 | wrist target | compact normalized wrist x/y/z, `round(v * 127)` |

Finger curl is normalized open-to-fist in `[0, 1]`. Spread is signed relative
to the middle finger. Rich per-joint, pinch, contact, and occlusion state is
represented in the TypeScript core and KGM2 draft; this KGM1 extension is the
smallest runtime target needed to drive VRM fingers.

## Coordinate conventions

- Right-handed. +X right, +Y up, +Z toward the viewer (three.js camera space).
- Quaternion is the head rotation in camera space. The viewer applies it
  relative to a captured neutral pose ("Center" calibration), so absolute
  frame alignment between tracker and renderer is not required.
- Mirror mode is resolved on the tracker side before encoding:
  quaternion `(x, y, z, w) -> (x, -y, -z, w)`, position `x -> -x`,
  and Left/Right blendshape channels swapped. The wire format itself has
  no mirror flag.

## Bandwidth

| Payload | Bytes/frame | At 30 fps | At 60 fps |
|---|---|---|---|
| FACE | 76 | 2.3 KB/s | 4.6 KB/s |
| FACE + POSE | 119 | 3.6 KB/s | 7.1 KB/s |
| FACE + HANDS x2 | 109 | 3.2 KB/s | 6.4 KB/s |

For comparison, streaming the webcam video for remote tracking would cost
about 1-3 MB/s. Parametric motion is roughly 400x smaller.

## Transport bindings

- WebTransport: one frame per datagram. Unreliable, unordered. Receivers
  keep only the newest frame per source (compare `seq` with wrap handling).
- WebSocket: one frame per binary message. Reliable and ordered; head-of-line
  blocking can add latency on loss. Used as the compatibility path.
- BroadcastChannel: one frame per message. Same-browser demo path.

## Versioning

`version` is bumped on any incompatible layout change. Decoders MUST drop
frames with an unknown version. Planned for KGM2 (see docs/design/DD-006):
smallest-three quaternion packing, delta frames with periodic keyframes, richer
per-joint hand blocks, and a channel-mask for sparse blendshape updates.
