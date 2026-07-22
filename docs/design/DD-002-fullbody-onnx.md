<!-- i18n: language-switcher -->
[English](DD-002-fullbody-onnx.md) | [日本語](DD-002-fullbody-onnx.ja.md)

# DD-002: Full-Body Backend via ONNX Runtime Web

Status: research design. Backlog: KGM-023.

## Problem

MediaPipe Pose (BlazePose) is fast but its 33-keypoint accuracy degrades on
seated, occluded, and side poses common in streaming setups. Stronger pose
models (YOLO-pose family, RTMPose) exist as ONNX and now run in-browser on
WebGPU through ONNX Runtime Web.

## Goals

- A pluggable pose backend interface; MediaPipe stays the default.
- 30 fps full-body on a mid-range dGPU; graceful CPU/WASM fallback at lower
  fps rather than failure.
- Keep the privacy property: inference stays on-device.

## Backend interface

```
interface PoseBackend {
  init(opts): Promise<void>
  detect(video: HTMLVideoElement, tMs: number): CanonicalPose | null
  dispose(): void
}
// CanonicalPose: named keypoints (COCO-17 superset) in meters,
// hip-centered, +Y up, with per-point confidence.
```

The solver and codec only see CanonicalPose. Backends: `mediapipe` (today),
`onnx-yolo-pose`, `onnx-rtmpose`.

The implemented TypeScript boundary lives in `src/core/ml.ts`:

- `PoseBackend`
- `OnnxModelSpec`
- `OnnxRuntimeAdapter`
- `chooseExecutionProvider()`
- `createModelExportManifest()`

## Model candidates

| Model | Points | Notes to verify at implementation time |
|---|---|---|
| YOLO11-pose (n/s) | 17 | one-stage, easy pre/post; check AGPL licensing impact |
| RTMPose (t/s) | 17/26 | top-down, needs a person detector stage; permissive license |
| MoveNet Thunder | 17 | TF origin, easy conversion, older |

Licensing is a first-class selection criterion: AGPL models cannot ship in
the default build; they can be a user-side plugin.

## Pipeline

1. Preprocess in WebGPU (letterbox, normalize) to avoid CPU copies.
2. ORT Web session with `webgpu` execution provider, fp16 weights;
   int8 as a stretch goal after accuracy validation.
3. Postprocess (NMS for one-stage models) in JS or a small WGSL kernel.
4. Lift 2D keypoints to pseudo-3D: reuse MediaPipe's world landmarks when
   both run, or a small learned lifting MLP (research task).

## Evaluation plan

Fixed recorded clips (KGM-047 fixtures) scored on: keypoint stability
(temporal variance at rest), seated-pose plausibility (manual rubric),
fps and VRAM on three GPU tiers. Results table committed to docs.

Use `summarizeModelBenchmark()` for the committed benchmark table so WebGPU,
WASM, and CPU fallback results are comparable.

## Risks

- WebGPU availability (no Safari stable path yet at design time): backend
  stays optional, never required.
- 2D-only models lose the metric world coordinates BlazePose provides; the
  lifting step is the hard research part and gates KGM-024 quality.
