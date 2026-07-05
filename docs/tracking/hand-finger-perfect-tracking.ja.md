# Hand and Finger-perfect Tracking Design

> English version: [hand-finger-perfect-tracking.md](hand-finger-perfect-tracking.md)

## 1. Goal

Webcamだけで、指1本1本を自然に、安定して、破綻なく動かす。

ここでいう「完璧」は、単に21個のlandmarkを表示することではありません。アバターの指が折れない、震えない、左右が入れ替わらない、指先がワープしない、意図したジェスチャーが伝わることです。

## 2. Required outputs

手ごとに次を出します。

- handedness
- palm pose
- 21 landmarks
- world landmarks
- per-finger MCP/PIP/DIP/Tip state
- curl
- spread
- pinch distance
- contact target
- tip velocity
- occlusion flag
- confidence
- warnings

## 3. Landmark chains

| Finger | Chain | Derived values |
|---|---|---|
| thumb | wrist, CMC, MCP, IP, tip | opposition, pinch, thumb curl |
| index | wrist, MCP, PIP, DIP, tip | point, pinch, trigger |
| middle | wrist, MCP, PIP, DIP, tip | main curl, grip |
| ring | wrist, MCP, PIP, DIP, tip | grip, relaxed state |
| pinky | wrist, MCP, PIP, DIP, tip | spread, expressive curl |

## 4. Processing pipeline

```text
raw landmarks
  -> handedness correction
  -> coordinate normalization
  -> palm basis estimation
  -> per-finger bone vector extraction
  -> joint angle estimation
  -> curl/spread/pinch/contact derivation
  -> confidence gate
  -> outlier rejection
  -> One Euro Filter
  -> anatomy clamp
  -> temporal prediction for occlusion
  -> avatar rig mapping
```

## 5. Anti-broken-finger rules

- A distal segment must not flip through the proximal segment.
- DIP should usually follow PIP; if not, confidence must drop.
- Thumb uses a separate model; never treat thumb as a normal finger.
- When a hand is edge-on to camera, reduce amplitude and rely on previous state.
- For short occlusion, predict for a limited time instead of snapping.
- For long occlusion, fade to neutral pose.
- For fast motion blur, clamp velocity before smoothing.

## 6. Gesture states

The system should expose high-level states in addition to raw joint values.

- open palm
- fist
- point
- peace
- pinch
- OK sign
- thumbs up
- drum grip
- stick holding
- keyboard-like finger taps

## 7. Contact estimation

Finger contact is needed for expressive avatars and musical performance.

Signals:

- fingertip distance to thumb
- fingertip velocity near zero
- fingertip crossing a calibrated surface
- object or stick detector proximity
- audio onset for drum hits

Contact must use hysteresis:

- enter threshold is stricter
- exit threshold is looser
- confidence decays gradually

## 8. Calibration

Calibration screens:

1. open palm front
2. fist
3. pinch index-thumb
4. pinch middle-thumb
5. relaxed hand
6. drum stick grip, if drummer mode is enabled

Calibration output:

- hand scale
- finger length ratios
- neutral spread
- max curl
- camera handedness mode
- smoothing strength preference

## 9. Benchmarks

Test clips:

- slow open/close
- fast open/close
- finger counting 1-5
- pinch repeated
- hands crossing
- hand partly outside frame
- low light
- motion blur
- drum roll with sticks

Metrics:

- fingertip jitter px RMS
- curl stability
- false left/right swap count
- impossible joint count
- recovery time after occlusion
- avatar visual failure rate
