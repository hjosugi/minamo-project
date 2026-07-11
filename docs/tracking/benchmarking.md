<!-- i18n: language-switcher -->
[English](benchmarking.md) | [日本語](benchmarking.ja.md)

# Benchmarking and Quality Gates

## 1. Why benchmarks matter

The product wins by natural motion, not by a long feature list. Benchmarks must measure visible stability.

## 2. Metrics

- end-to-end latency
- inference latency
- FPS
- dropped frames
- face blendshape jitter
- blink false positives
- mouth flicker during silence
- fingertip jitter
- impossible finger pose count
- hand swap count
- drum hit timing error
- drum false positives/negatives
- avatar visual failure count

## 3. Golden clips

Create a small public test set:

- normal lighting
- low lighting
- fast hand movement
- occluded hands
- glasses
- mask
- drum sticks
- drum roll

## 4. Pass/fail gates

P0 gates:

- no NaN frame can be rendered
- no impossible finger pose can reach avatar without warning
- no drum hit with confidence below threshold
- FPS target must be visible in UI
- privacy mode must not send raw video
