# Occlusion Recovery

> English version: [occlusion-recovery.md](occlusion-recovery.md)

## 1. Goal

手や顔が一部隠れても、アバターが急に壊れないようにする。

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
