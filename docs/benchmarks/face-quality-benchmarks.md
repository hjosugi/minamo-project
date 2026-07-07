# Face Quality Benchmarks

Status: implemented benchmark definitions for issues #106 and #107.

## Mouth Flicker

Input is a neutral-mouth clip with one `mouth.open` sample per frame.

Metric:

- `mouthFlickerScore(samples)` is the mean absolute frame-to-frame delta.
- Pass target: `<= 0.035` for a neutral hold at 30-60 fps.
- Warning target: `> 0.06`, because neutral mouth motion becomes visible on VRM and layered PNG mouths.

Run this benchmark on:

- neutral hold
- low-light neutral hold
- speaking clip with audio assist off
- speaking clip with audio assist on

## Blink False Positives

Input is a labeled clip with `blink` and `expectedClosed` for each frame.

Metric:

- `blinkFalsePositiveRate(samples)` counts frames where `blink >= 0.62` while the eye is labeled open.
- Pass target: `< 1%` for front-facing clips.
- Warning target: `< 3%` for yawed/glasses clips.

The benchmark should be reported separately for left and right eyes so one-sided glare does not hide in an average.

## Debug Graph

The tracker's blendshape meter and hand debug canvas are the live debug surface. For face-specific debugging, record these channels together:

- `eyeBlinkLeft`, `eyeBlinkRight`, `eyeSquintLeft`, `eyeSquintRight`
- `jawOpen`, `mouthStretchLeft`, `mouthStretchRight`, `mouthPucker`, `mouthFunnel`
- derived `mouth.open`, `mouth.wide`, `mouth.pucker`, and vowel
- `FACE_GLASSES_GLARE_POSSIBLE` warning state

