<!-- i18n: language-switcher -->
[English](stability-anti-jitter.md) | [日本語](stability-anti-jitter.ja.md)

# Stability, Anti-jitter, and Anti-broken-motion Design

## 1. Principle

Raw ML output is not animation-ready. Every signal must pass a stability layer before it touches an avatar.

## 2. Problems to prevent

- jitter
- trembling mouth
- flickering eyelids
- broken fingers
- inverted wrists
- elbow/knee flips
- left/right hand swap
- fingertip teleport
- stick teleport
- false drum hits
- avatar parameter spikes

## 3. Filter stack

Recommended order:

1. finite check
2. raw confidence gate
3. coordinate bounds check
4. temporal outlier rejection
5. One Euro Filter
6. velocity clamp
7. acceleration / jerk clamp for high-risk signals
8. anatomy clamp
9. inverse kinematics constraint
10. avatar rig clamp
11. hysteresis for binary states
12. confidence decay for occlusion

## 4. One Euro Filter defaults

| Signal | minCutoff | beta | Notes |
|---|---:|---:|---|
| head rotation | 1.2 | 0.04 | responsive but stable |
| mouth open | 1.8 | 0.08 | speech needs speed |
| blink | 2.5 | 0.12 | keep quick blink |
| finger curl | 1.4 | 0.06 | avoid trembling |
| fingertip position | 1.1 | 0.08 | allow fast motion |
| drum stick tip | 2.8 | 0.20 | preserve hit timing |

## 5. Anatomy constraints

Constraints are user-calibrated. Defaults are conservative.

If raw pose violates constraints:

- clamp if violation is small
- reduce confidence if violation is large
- hold previous state if violation is sudden
- emit warning

## 6. Occlusion recovery

Short occlusion:

- predict from previous velocity
- decay confidence
- keep avatar motion continuous

Long occlusion:

- fade to neutral
- stop high-risk actions such as drum hits
- wait for stable reacquisition

## 7. No weird movement rules

- Never apply a frame containing NaN or Infinity.
- Never allow a single frame to rotate a bone over the max safe delta.
- Never let blendshape jump from 0 to 1 unless signal confidence is high and the movement is physically plausible.
- Never let hidden/low-confidence fingers trigger contact-sensitive actions.
- Never infer a drum hit from one noisy visual frame.
