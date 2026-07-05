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

Use Inochi2D-compatible parameters for open 2D avatar pipelines. Keep a separate mapper because parameter naming and rig semantics differ from Live2D.

## 4. Rig limits and custom mappings

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

## 5. OBS

OBS path:

- Browser Source for local web app
- transparent background mode
- Spout/NDI future
- hotkeys for calibration and reset

## 6. AI character engines

AIRI/persona-engine-like projects can consume:

- expression state
- speaking state
- gaze state
- gesture state
- drum hit events

Do not mix LLM emotion generation with raw facial tracking without priority rules. User expression should win over generated emotion by default.
