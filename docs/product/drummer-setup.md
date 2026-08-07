<!-- i18n: language-switcher -->
[English](drummer-setup.md) | [日本語](drummer-setup.ja.md)

# Drummer Setup Guide

## Percussion kits

The tracker is not limited to a five-piece kit played with sticks. Pick the kit
in **Percussion kit**; each brings its own zone layout and its own idea of what
a strike looks like.

| Kit | Zones | Strike |
| --- | --- | --- |
| Drum kit | hi-hat, snare, tom, ride, crash, kick | stick grip |
| Cajon | bass, slap L/R, tap L/R | open hand |
| Congas | quinto, conga, tumba, two edges | open hand |
| Bongos | macho, hembra, two edges | open hand |
| Hand percussion | left, centre, right, aux | open hand |
| Hybrid | bass, slap, aux hat, aux snare, kick | stick **or** hand |

Why the strike style is per kit and not global: a stick grip is a partly closed
hand (finger curl above ~0.35) and an open-palm slap is the opposite (below
~0.35), so the two can never both be true. A single hardcoded stick check meant a
cajon player's hand could sit dead centre in a calibrated zone and never register
a strike. The style is evaluated **per hand**, which is what makes the hybrid kit
work: a stick in one hand and a bare hand on the other both count in the same
frame.

Switching kit replaces the zone set, so its calibration starts over — it is a
different instrument in a different place.

The MIDI path reaches the same zones. `GM_PERCUSSION_ZONE_TYPES` in
`src/core/bleMidiStick.ts` maps the whole General MIDI percussion range —
bongos and congas onto `head`/`edge`, and shakers, blocks, scrapers and bells
onto `percussion` — so an e-kit or pad controller drives a hand-percussion kit
without a camera. Notes outside 35-81 still produce no hit rather than a
guessed one.

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
