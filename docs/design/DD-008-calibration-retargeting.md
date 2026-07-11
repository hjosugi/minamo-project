<!-- i18n: language-switcher -->
[English](DD-008-calibration-retargeting.md) | [日本語](DD-008-calibration-retargeting.ja.md)

# DD-008: Calibration and Retargeting

Status: design. Backlog: KGM-013, KGM-014, KGM-044.

## Problem

Two independent gaps sit between a webcam and a good-looking avatar:

1. Human -> canonical channels: faces differ. Raw blendshape ranges vary
   per person, camera, and lighting. (Calibration)
2. Canonical channels -> avatar controls: avatars differ. A Perfect Sync
   VRM wants 52 channels 1:1; a 5-expression VRoid model wants a curated
   mapping; an Inochi2D puppet wants named parameters. (Retargeting)

Minamo separates them: calibration lives tracker-side and travels on the
wire already normalized; retargeting lives renderer-side per avatar.

## Calibration (tracker-side)

Guided flow, ~30 seconds:

1. Neutral hold (3 s): per-channel offset o_i = median of samples.
2. Prompted maxima: big mouth open, wide smile, brow raise, hard blink,
   look far left/right/up/down. Per-channel gain g_i = 1 / p95(max phase).
3. Applied pre-filter: w_i' = clamp01((w_i - o_i) * g_i).
4. Sanity clamps: gain in [0.5, 4]; channels never observed keep identity.

Profile JSON: { name, camera fingerprint, offsets[52], gains[52],
deadzones[52], created }. Multiple profiles; auto-select by camera device.

The interactive mixer (KGM-014) edits the same numbers manually, so the
data model is one struct with two UIs.

## Retargeting (renderer-side)

Mapping document per avatar:

```
{ "schema": "minamo.expression-map.v1",
  "name": "Creator rig",
  "targets": [
    { "out": "happy",           // VRM expression or Inochi2D param
      "expr": [ ["mouthSmileLeft", 0.5], ["mouthSmileRight", 0.5] ],
      "curve": "easeIn", "clamp": [0, 1] } ] }
```

- Perfect Sync detection: if an avatar exposes >= 45 of the ARKit names,
  generate the identity mapping automatically and skip the editor.
- Editor: pick output, add weighted sources, drag a curve preset, see it
  live. Export/import JSON; community-shareable per avatar.
- The same document format drives VRM expressions and Inochi2D parameters
  (DD-004); only the output namespace differs.
- Schema: [../product/expression-mapping.schema.json](../product/expression-mapping.schema.json).

## Why normalize before the wire

Sending calibrated channels means every renderer, recording (DD-007), and
collab peer sees the same normalized signal, and calibration does not need
to be distributed to viewers. The cost: raw uncalibrated data is not
recoverable downstream, which is acceptable; recordings note the profile in
metadata.
