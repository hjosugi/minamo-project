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

## 3. Implemented face flow

The tracker has a 30-second guided face calibration:

1. Neutral hold for 3 seconds.
2. Six expression range passes at 4.5 seconds each.
3. Per-channel offset is estimated from neutral samples.
4. Per-channel gain is estimated from expression peaks.
5. The generated profile is saved locally and can be exported/imported as JSON.

The profile is applied after raw signal sanitization and before One Euro
filtering, so both the live meters and outgoing KGM1 frames use the calibrated
signal.

Manual tuning is available in the 52-channel meter: drag a channel row to set
gain from 0-2x, adjust the selected channel deadzone from 0-0.2, and mute with
right-click or touch long-press. These values are stored in the same local JSON
profile and survive export/import.

## 4. UX

The UI should guide the user through short actions with progress bars and live quality warnings.

Examples:

- "Open your hand"
- "Make a fist"
- "Blink twice"
- "Say A I U E O"
- "Tap snare 4 times"
- "Tap hi-hat 4 times"

## 5. Saved profile

Calibration profile should be local-first JSON.

```json
{
  "schema": "minamo.calibration.v1",
  "name": "guided-2026-07-06T00:00:00.000Z",
  "createdAt": "2026-07-06T00:00:30.000Z",
  "offsets": [0.0],
  "gains": [1.0],
  "deadzones": [0.0],
  "muted": [false]
}
```
