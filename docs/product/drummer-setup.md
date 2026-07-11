<!-- i18n: language-switcher -->
[English](drummer-setup.md) | [日本語](drummer-setup.ja.md)

# Drummer Setup Guide

## Camera

- Put the camera high enough to see sticks, wrists, snare, hi-hat, and ride.
- Use 720p/60 or 1080p/60 if available.
- Avoid strong backlight from stage LEDs.

## Calibration

1. Start tracker.
2. Enable Drummer mode. The tracker enables hand tracking automatically.
3. Pick a zone in Drummer setup.
4. Press **Place zone** and click the camera preview where that zone appears.
5. Adjust radius until the overlay covers the playable area.
6. Repeat for snare, hi-hat, ride, crash, tom, and kick.
7. Check that the hand debug and drum zone list respond while holding a drum grip.

## Reliability checks

- Fast rolls should produce separate hits without double-triggering.
- Cross-stick or stick-over-stick moments should not swap left/right hands.
- If kick or hi-hat pedal inference is enabled, verify it against audio before
  using it live.

## Drummer Mode Setup Screen

The tracker exposes one setup surface with:

- camera preview and hand/stick confidence
- zone list: snare, hi-hat, ride, crash, tom, kick
- per-zone radius
- click-to-place zone center from the camera preview
- audio onset meter
- benchmark result summary

Zones persist in local settings under `minamo.drum-kit.calibration.v1`.
Calibration data is not published over KGM1; the viewer overlay derives its
live state from compact hand curl and wrist targets.

## Pedal Inference

Hi-hat pedal:

- detect high-frequency audio onset near the expected tick
- combine with visual hi-hat zone activity
- output a closed/open scalar, not only a hit

Kick pedal:

- detect low-frequency onset
- emit a `DrumHitEvent` with `zoneType: "kick"`
- require audio confirmation unless a foot camera model is enabled

## OBS Overlay

Use the tracker **Copy OBS overlay URL** button or open:

```text
viewer/?preset=obs&room=stage&bg=transparent&hud=0&camera=locked&drum=1
```

The current OBS-friendly overlay renders hand-derived drum grip activity:

- transparent background
- zone labels with active-zone highlighting
- hand labels showing gesture and nearest zone
- no camera video

Future `DrumHitEvent` transport can replace the hand-derived pulse source
without changing the OBS URL.
- no camera video
