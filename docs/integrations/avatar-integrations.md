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

## 4. OBS

OBS path:

- Browser Source for local web app
- transparent background mode
- Spout/NDI future
- hotkeys for calibration and reset

## 5. AI character engines

AIRI/persona-engine-like projects can consume:

- expression state
- speaking state
- gaze state
- gesture state
- drum hit events

Do not mix LLM emotion generation with raw facial tracking without priority rules. User expression should win over generated emotion by default.
