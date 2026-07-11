<!-- i18n: language-switcher -->
[English](hand-finger-perfect-tracking.md) | [日本語](hand-finger-perfect-tracking.ja.md)

# Hand and Finger-perfect Tracking Design

> 日本語版: [hand-finger-perfect-tracking.ja.md](hand-finger-perfect-tracking.ja.md)

## 1. Goal

Move each individual finger naturally, stably, and without breakage — using only a webcam.

"Perfect" here does not simply mean displaying 21 landmarks. It means the avatar's fingers do not break, do not tremble, left and right hands do not swap, fingertips do not warp, and intended gestures come across.

## 2. Required outputs

For each hand, output the following.

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
