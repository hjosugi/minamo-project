<!-- i18n: language-switcher -->
[English](PROTOCOL_V2_DRAFT.md) | [日本語](PROTOCOL_V2_DRAFT.ja.md)

# KGM Rich Tracking Protocol (v2 draft)

Version: 0.1.0
Status: Draft (target schema)

Terminology used below is defined in [GLOSSARY.md](GLOSSARY.md).

> **Relationship to other specs:** the implemented v1 wire format
> (76-byte binary frames, face + upper body) is [PROTOCOL.md](PROTOCOL.md).
> This document is the draft semantic schema for the next protocol
> generation - hands, per-finger states, drum events, and quality
> metadata - and feeds the KGM2 design in
> [design/DD-006-kgm2.md](design/DD-006-kgm2.md).
Target: realtime avatar tracking, local-first webcam tracking, streaming, collaboration, remote rendering

## 1. Design goals

KGM1 is a compact realtime motion protocol for avatar streaming.

The protocol must support:

- face landmarks, face blendshapes, gaze, iris, eyelids, mouth state
- body pose and upper-body motion
- left and right hands with every finger tracked independently
- per-finger joint rotations, curl, spread, tip velocity, contact state, confidence, occlusion state
- drum performance events: stick, hit, drum piece, velocity, foot pedal, audio onset alignment
- quality metadata: latency, frame confidence, dropped frames, smoothing amount, model identity
- avatar mapping metadata for VRM, Live2D, Inochi2D, custom rigs
- binary transport over WebTransport datagrams
- JSON transport for debugging, tests, and WebSocket fallback

## 2. Transport modes

### 2.1 KGM1 JSON

Use this during development and debugging.

```json
{
  "magic": "KGM1",
  "version": "0.1.0",
  "frameId": 1024,
  "clock": {
    "sourceTimeNs": 1720000000000000000,
    "monotonicTimeNs": 12000000000,
    "estimatedLatencyMs": 18.4
  },
  "tracking": {
    "face": {},
    "hands": [],
    "body": {},
    "drums": {}
  },
  "quality": {
    "fps": 59.8,
    "overallConfidence": 0.91,
    "droppedFrames": 0,
    "stabilizer": "one_euro+anatomy_clamp+outlier_gate"
  }
}
```

### 2.2 KGM1B binary

Use this for realtime transport.

Header layout:

| Offset | Type | Name | Description |
|---:|---|---|---|
| 0 | u32 | magic | ASCII `KGM1` |
| 4 | u16 | version_major | protocol major version |
| 6 | u16 | version_minor | protocol minor version |
| 8 | u64 | frame_id | monotonically increasing frame id |
| 16 | u64 | source_time_ns | source clock timestamp |
| 24 | u64 | monotonic_time_ns | sender monotonic clock timestamp |
| 32 | u16 | flags | bit flags |
| 34 | u8 | encoding | 0=json, 1=flatbuffer-like, 2=msgpack, 3=custom packed |
| 35 | u8 | payload_type | 0=full frame, 1=delta, 2=event only |
| 36 | u32 | payload_len | byte length |
| 40 | bytes | payload | encoded frame |

The packet framing is implemented in `shared/kgm1b.js`, the Rust workspace
crate `crates/kgm1-codec`, and the Python workspace-local package
`packages/kgm1-codec-py`. JS-generated golden vectors are decoded by Rust and
Python in `pnpm test`.

### 2.3 KGM2 compact face profile

KGM2 is the compact binary profile used to validate DD-006 before it becomes
the default realtime packet. The implemented profile lives in `shared/kgm2.js`
and is guarded by `tests/run-tests.mjs`.

Header layout:

| Offset | Type | Name | Description |
|---:|---|---|---|
| 0 | u16 | magic | `0x324b` |
| 2 | u8 | version | `2` |
| 3 | u8 | frame_type | `1` keyframe, `2` delta |
| 4 | u32 | t | source timestamp in milliseconds |
| 8 | u16 | seq | sequence number |
| 10 | u16 | key_id | referenced keyframe id |

Face keyframe body:

| Field | Type | Notes |
|---|---|---|
| head rotation | u32 | smallest-three quaternion, 2-bit index + 3 x 10-bit components |
| head position | i16 x3 | meters to millimeters |
| weights | u8 x52 | canonical ARKit channel order |

Face delta body:

| Field | Type | Notes |
|---|---|---|
| head rotation | u32 | absolute smallest-three quaternion |
| head position delta | i8 x3 | delta from keyframe, millimeters |
| channel mask | 7 bytes | 52-bit sparse channel mask |
| weight deltas | i8 x N | signed deltas for masked channels only |

Delta frames are based on the last keyframe, not the previous delta. A decoder
rejects a delta if the referenced base keyframe has not been seen, which keeps
loss recovery bounded by the keyframe interval. In the current regression
corpus, an idle face delta is 26 bytes and the average KGM2 frame size is at
least 35% smaller than KGM1 face frames.

## 3. Coordinate systems

KGM1 carries three coordinate spaces.

| Space | Use |
|---|---|
| `image` | normalized screen coordinates, x/y in 0..1, z model-relative |
| `world` | model world coordinates from the tracker |
| `avatar` | rig-ready normalized values after stabilization and retargeting |

All rotations use quaternions in `[x, y, z, w]` order. Euler angles are allowed only for debug output.

## 4. Face schema

```ts
interface FaceState {
  detected: boolean;
  confidence: number;
  head: HeadState;
  eyes: EyePairState;
  mouth: MouthState;
  brows: BrowState;
  cheeks: CheekState;
  blendshapes: Record<string, number>;
  landmarks?: Landmark[];
}
```

### 4.1 Eye state

```ts
interface EyeState {
  blink: number;
  openness: number;
  squint: number;
  gaze: Vec3;
  irisCenter?: Vec2;
  pupilDilationApprox?: number;
  confidence: number;
}
```

Quality rules:

- Blink must use hysteresis to avoid rapid open/close flicker.
- Gaze must clamp impossible jumps.
- If one eye is occluded by head rotation, infer it from the other eye and head pose with lower confidence.
- Wink must be explicit; smoothing must not erase intentional wink.

### 4.2 Mouth state

```ts
interface MouthState {
  open: number;
  wide: number;
  pucker: number;
  smileLeft: number;
  smileRight: number;
  frownLeft: number;
  frownRight: number;
  jawForward: number;
  tongueOut?: number;
  vowel?: "A" | "I" | "U" | "E" | "O" | "neutral";
  confidence: number;
}
```

Quality rules:

- Mouth open must not jump on brief landmark noise.
- Lip corners must be smoothed independently from jaw open.
- Talking animation can be audio-assisted, but camera signal remains primary.
- Smile must not trigger only because the user turns their head.

## 5. Hand and finger schema

A hand has 21 base landmarks, world landmarks, and derived rig-ready finger states.

```ts
interface HandState {
  handedness: "Left" | "Right";
  detected: boolean;
  confidence: number;
  palm: PalmState;
  fingers: Record<FingerName, FingerState>;
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
  occlusion: OcclusionState;
}
```

Finger names:

```ts
type FingerName = "thumb" | "index" | "middle" | "ring" | "pinky";
```

```ts
interface FingerState {
  name: FingerName;
  mcp: JointState;
  pip?: JointState;
  dip?: JointState;
  tip: JointState;
  curl: number;
  spread: number;
  pinchToThumb?: number;
  contact: ContactState;
  tipVelocity: Vec3;
  confidence: number;
  occluded: boolean;
}
```

### 5.1 Per-finger landmark indices

| Finger | Landmark chain |
|---|---|
| thumb | 1, 2, 3, 4 |
| index | 5, 6, 7, 8 |
| middle | 9, 10, 11, 12 |
| ring | 13, 14, 15, 16 |
| pinky | 17, 18, 19, 20 |

### 5.2 Anatomy clamp

The tracker must reject broken poses.

| Joint | Typical safe rule |
|---|---|
| MCP flexion | clamp to a calibrated range per user |
| PIP flexion | never bend backwards beyond calibrated extension |
| DIP flexion | usually follows PIP with lower amplitude |
| Finger spread | clamp between adjacent rays |
| Thumb | use a separate saddle-joint model, not the same as fingers |

Rules:

- No finger segment may invert through its parent segment unless confidence is explicitly low and the pose is marked as recovered.
- If a fingertip teleports, hold previous velocity-limited state for 1-3 frames.
- If confidence is low, reduce animation amplitude rather than snapping.
- Use quaternion shortest-path interpolation to avoid 180-degree flips.

## 6. Drum performance schema

```ts
interface DrumState {
  kitCalibrated: boolean;
  sticks: StickState[];
  zones: DrumZone[];
  hits: DrumHitEvent[];
  pedals: PedalState[];
  audioOnsets?: AudioOnset[];
}
```

```ts
interface DrumHitEvent {
  eventId: string;
  timeNs: number;
  hand?: "Left" | "Right";
  stickId?: string;
  zoneId: string;
  zoneType: "snare" | "hihat" | "ride" | "crash" | "tom" | "floorTom" | "kick" | "pedal" | "unknown";
  position: Vec3;
  velocity: Vec3;
  speed: number;
  confidence: number;
  audioAligned: boolean;
}
```

Drum hit decision should combine:

- stick tip trajectory
- hand/finger velocity
- drum zone intersection
- downstroke direction
- audio onset timing
- cooldown per zone
- rebound pattern

## 7. Quality schema

```ts
interface QualityState {
  fps: number;
  captureLatencyMs: number;
  inferenceLatencyMs: number;
  stabilizationLatencyMs: number;
  transportLatencyMs?: number;
  overallConfidence: number;
  perSignalConfidence: Record<string, number>;
  droppedFrames: number;
  warnings: string[];
}
```

Quality warnings examples:

- `LOW_LIGHT`
- `HAND_OCCLUDED`
- `FACE_PARTIAL`
- `MOUTH_UNSTABLE`
- `FINGER_ANATOMY_CLAMPED`
- `DRUM_STICK_MOTION_BLUR`
- `AUDIO_DESYNC`
- `TRANSPORT_CONGESTED`

## 8. Latency budget

| Stage | Target |
|---|---:|
| capture | 1-8 ms |
| inference | 4-16 ms |
| postprocess | 1-3 ms |

## 9. Multi-source clock sync

Collaboration rooms can mix WebSocket and WebTransport sources with different
local clocks. `shared/kgm2.js` implements an NTP-style probe:

```text
clientSendMs -> relayReceiveMs -> relaySendMs -> clientReceiveMs
```

`ClockOffsetEstimator` keeps the lowest-RTT samples and estimates sender to
relay offset. `MultiSourceClockSync` stores one estimator per source and
aligns source timestamps onto a shared relay timeline. The probe payload is
transport-agnostic: WebSocket sends it as a JSON control message, while
WebTransport sends it on a reliable control stream.

Regression tests cover a mixed `ws-source` and `wt-source` pair and assert the
aligned phase error stays below the 10 ms target.
| render mapping | 1-4 ms |
| transport local/remote | 1-20 ms |
| total local preview | under 33 ms target |

## 9. Stability requirements

Every KGM1 producer must implement a stability layer after raw ML output.

Required gates:

1. finite number check
2. coordinate bounds check
3. confidence gate
4. velocity gate
5. acceleration/jerk gate for high-risk signals
6. per-joint anatomy clamp
7. temporal smoothing
8. occlusion recovery
9. avatar rig clamp
10. warning emission

## 10. Compatibility levels

| Level | Meaning |
|---|---|
| KGM1-L0 | Face only |
| KGM1-L1 | Face + hands |
| KGM1-L2 | Face + hands + upper body |
| KGM1-L3 | L2 + finger-perfect derived states |
| KGM1-L4 | L3 + drum events |
| KGM1-L5 | L4 + remote WebTransport + multi-avatar |
| KGM1-L6 | L5 + custom YOLO/ONNX/WebGPU models |

## 11. Privacy

The default product must process camera frames on device. Remote transport must send KGM1 motion frames, not raw camera frames, unless the user explicitly enables video sharing.
