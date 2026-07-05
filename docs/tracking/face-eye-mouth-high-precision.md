# Face, Eye, and Mouth High-precision Tracking

> 日本語版: [face-eye-mouth-high-precision.ja.md](face-eye-mouth-high-precision.ja.md)

## 1. Goal

Capture eye and mouth movement with high accuracy, so that the avatar's facial expression looks natural.

## 2. Eye tracking requirements

- independent left/right blink
- eyelid openness
- squint
- wink detection
- gaze direction
- iris center if available
- head rotation-aware eye compensation
- no blink flicker
- no gaze teleport

## 3. Mouth tracking requirements

- mouth open
- mouth wide
- lip pucker
- jaw forward
- smile left/right
- frown left/right
- vowel-like shape A/I/U/E/O
- audio-assisted lip sync option
- speech/no-speech state

## 4. Blendshape mapping

The face adapter should preserve raw blendshapes and also produce normalized semantic controls.

| Semantic control | Example target |
|---|---|
| `mouth.open` | VRM `aa`, Live2D `ParamMouthOpenY` |
| `mouth.wide` | Live2D `ParamMouthForm`, VRM smile/wide custom |
| `mouth.pucker` | VRM `ou`, custom pucker |
| `leftEye.blink` | VRM `blinkLeft`, Live2D `ParamEyeLOpen` inverted |
| `rightEye.blink` | VRM `blinkRight`, Live2D `ParamEyeROpen` inverted |
| `gaze` | eye bone / look-at controller |

## 5. Accuracy rules

- Head yaw should not accidentally trigger smile.
- One-eye occlusion should not cause both eyes to blink.
- Micro mouth noise should not move the avatar mouth during silence unless the user chooses high sensitivity.
- Intentional quick blink must remain quick; do not over-smooth it.
- Lip sync should combine camera and audio, but camera remains source of truth for expression.

## 6. Calibration

Calibration flow:

1. neutral face
2. eyes open
3. blink both
4. blink left/right
5. look left/right/up/down
6. mouth closed
7. mouth open A
8. wide I
9. pucker U/O
10. smile

## 7. Failure cases

- glasses glare
- mask
- microphone in front of mouth
- extreme head rotation
- low light
- heavy makeup or face paint
- camera too low/high

Each failure should emit warnings and degrade gracefully.
