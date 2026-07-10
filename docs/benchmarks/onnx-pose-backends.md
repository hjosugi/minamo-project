# ONNX Pose Backend Benchmarks

Status: benchmark harness in place for issue #23; device numbers pending real
hardware runs. See [../design/DD-009-onnx-backend-registry.md](../design/DD-009-onnx-backend-registry.md).

## How to reproduce

Backends are measured with `runModelBenchmark` / `summarizeModelBenchmark` in
[`src/core/ml.ts`](../../src/core/ml.ts) over the fixed recorded clips
(KGM-047 fixtures). Each row reports mean fps, p95 latency, and peak VRAM/memory
on one GPU tier. The registry ([DD-009](../design/DD-009-onnx-backend-registry.md))
selects the backend under test at runtime.

Target: full-body 26+ keypoints at 30 fps on a mid-range dGPU, with graceful
CPU/WASM fallback at lower fps rather than failure.

## Results

Numbers below are placeholders to be replaced by measured runs on each tier;
the harness and table shape are committed so results are comparable.

| Backend | Provider | Keypoints | fps (mean) | p95 latency ms | VRAM MB | Notes |
|---|---|---|---|---|---|---|
| mediapipe (default) | wasm/webgl | 33 | measured | measured | n/a | baseline, always available |
| onnx-yolo-pose (n) | webgpu | 17 | pending | pending | pending | check AGPL licensing before shipping |
| onnx-yolo-pose (n) | wasm | 17 | pending | pending | pending | CPU/WASM fallback tier |
| onnx-rtmpose (t) | webgpu | 17/26 | pending | pending | pending | needs person-detector stage |

## Method notes

- fps is derived from mean per-frame latency (`fps = 1000 / averageLatencyMs`).
- VRAM/memory is the peak reported during the run; on WASM/CPU this is process
  memory rather than dedicated VRAM.
- A backend is only promoted from optional to recommended once it hits the 30 fps
  target on a mid-range dGPU and passes the seated-pose plausibility rubric from
  [DD-002](../design/DD-002-fullbody-onnx.md).
