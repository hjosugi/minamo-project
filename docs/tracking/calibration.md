# Calibration Design

## 1. Goals

Calibration makes cheap webcams feel much better.

## 2. Calibration modules

- camera mirror and handedness
- face neutral
- eye range
- mouth range
- hand scale
- finger curl range
- avatar rig limits
- drum kit zones
- audio/video sync offset

## 3. UX

The UI should guide the user through short actions with progress bars and live quality warnings.

Examples:

- "Open your hand"
- "Make a fist"
- "Blink twice"
- "Say A I U E O"
- "Tap snare 4 times"
- "Tap hi-hat 4 times"

## 4. Saved profile

Calibration profile should be local-first JSON.

```json
{
  "cameraIdHash": "...",
  "avatarId": "...",
  "handScale": 1.0,
  "faceNeutral": {},
  "drumZones": [],
  "audioVideoOffsetMs": 0
}
```
