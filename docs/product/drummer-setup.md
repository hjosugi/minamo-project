# Drummer Setup Guide

## Camera

- Put the camera high enough to see sticks, wrists, snare, hi-hat, and ride.
- Use 720p/60 or 1080p/60 if available.
- Avoid strong backlight from stage LEDs.

## Calibration

1. Start tracker.
2. Enable Hands.
3. Keep both sticks still over the snare for two seconds.
4. Tap each kit zone slowly: snare, hi-hat, ride, crash, toms.
5. Check that visual hit candidates align with audio onsets.

## Reliability checks

- Fast rolls should produce separate hits without double-triggering.
- Cross-stick or stick-over-stick moments should not swap left/right hands.
- If kick or hi-hat pedal inference is enabled, verify it against audio before
  using it live.

## Drummer Mode Setup Screen

The tracker should expose one setup surface with:

- camera preview and hand/stick confidence
- zone list: snare, hi-hat, ride, crash, tom, floor tom, kick
- per-zone radius and cooldown
- tap-to-capture zone center from the current stick tip
- audio onset meter
- benchmark result summary

Persist zones in local settings. Do not publish calibration data unless the user connects to a room.

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

For an OBS-friendly drum overlay, render only recent `DrumHitEvent` pulses:

- transparent background
- zone labels hidden by default
- hit pulse opacity from confidence
- optional hand color coding
- no camera video
