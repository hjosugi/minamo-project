<!-- i18n: language-switcher -->
[English](avatar-integrations.md) | [日本語](avatar-integrations.ja.md)

# Avatar Integrations

## 1. VRM

Use VRM for 3D humanoid avatars.

Mapping targets:

- head rotation
- eye look-at
- blink left/right
- mouth vowels
- expression presets
- hand bones and finger curls

Preset profiles use the `minamo.avatar-preset.v1` schema documented in
[../product/avatar-preset-profile.schema.json](../product/avatar-preset-profile.schema.json).
Runtime target names are intentionally explicit:

- `expression:aa`, `expression:blinkLeft`, `expression:happy`
- `lookAt:yaw`, `lookAt:pitch`
- `finger:Right:index:proximal`, `finger:Left:thumb:spread`

## 2. Live2D

Use Live2D for 2D character streaming.

Mapping targets:

- ParamAngleX/Y/Z
- ParamEyeLOpen / ParamEyeROpen
- ParamMouthOpenY
- ParamMouthForm
- body sway
- hand/finger custom parameters when rigged

## 3. Inochi2D / Inox2D

Drop an `.inp` or `.inx` puppet onto the Viewer, or use **Open INP / INX**.
The Viewer runs the pinned Inox2D WebGL2/WASM backend locally and composites
its transparent canvas into the existing Three.js scene. No puppet data or
tracking data is uploaded.

The mapping editor lists parameters discovered from the puppet and generates
conservative head, blink, and mouth defaults from normalized name aliases.
Names that do not match remain unmapped; edit the JSON live and save the same
`minamo.expression-map.v1` format used by VRM. `.inp` and `.inx` use the same
runtime parser. BC7 textures are not supported by the pinned upstream renderer,
so re-export affected puppets with PNG or TGA textures.

## 4. Layered PNG / PSD

Layered PNG/PSD mode is the zero-rig fallback. Drop a PSD or a PNG set into the
viewer using the naming conventions in [../product/layered-avatar.md](../product/layered-avatar.md).
Blink weights switch `eyesOpen`/`eyesClosed`, jaw and rounded-mouth weights
switch `mouthClosed`/`mouthOpen`, and head pose drives per-layer parallax depth.

## 5. Rig limits and custom mappings

Every preset can clamp unsafe rig movement per target and can map one generated
target into a custom target expected by a creator rig.

```json
{
  "schema": "minamo.avatar-preset.v1",
  "name": "streaming rig",
  "format": "vrm",
  "rigLimits": {
    "lookAt:yaw": { "min": -0.25, "max": 0.25 },
    "ParamCustomSmile": { "min": 0, "max": 0.5 }
  },
  "mappings": [
    {
      "source": "expression:happy",
      "target": "ParamCustomSmile",
      "weight": 0.8,
      "curve": "linear"
    }
  ]
}
```

Expression retargeting uses the shareable
[`minamo.expression-map.v1`](../product/expression-mapping.schema.json) format.
Perfect Sync VRMs are auto-detected when at least 45 ARKit expression names are
present; the viewer then drives the matching expressions 1:1. Other rigs use
weighted source-channel mappings that can be edited live and exported as JSON.

## 6. OBS

OBS path:

- Browser Source for local web app
- transparent background mode
- Spout/NDI future
- hotkeys for calibration and reset

## 7. AI character engines

AIRI/persona-engine-like projects can consume:

- expression state
- speaking state
- gaze state
- gesture state
- drum hit events

Do not mix LLM emotion generation with raw facial tracking without priority rules. User expression should win over generated emotion by default.
