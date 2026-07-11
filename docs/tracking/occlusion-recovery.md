<!-- i18n: language-switcher -->
[English](occlusion-recovery.md) | [日本語](occlusion-recovery.ja.md)

# Occlusion Recovery

> 日本語版: [occlusion-recovery.ja.md](occlusion-recovery.ja.md)

## 1. Goal

Even when the hands or face are partially hidden, the avatar must not suddenly break.

## 2. State machine

```text
TRACKED -> SUSPECT -> PREDICTED -> FADED -> LOST -> REACQUIRING -> TRACKED
```

## 3. Per-signal behavior

| Signal | Short occlusion | Long occlusion |
|---|---|---|
| face | hold + low-pass | neutral face |
| eyes | infer from visible eye/head | open relaxed |
| mouth | hold for very short time | close relaxed |
| fingers | predict curl | relaxed hand |
| sticks | keep trajectory briefly | disable hit detection |
| body | slow hold | neutral pose |

## 4. Reacquisition

Reacquisition must be gradual. Do not snap from predicted state to raw state in one frame. Use confidence-weighted blending for 100-300ms.
