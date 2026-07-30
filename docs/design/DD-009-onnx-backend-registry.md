<!-- i18n: language-switcher -->
[English](DD-009-onnx-backend-registry.md) | [日本語](DD-009-onnx-backend-registry.ja.md)

# DD-009: Runtime-Toggleable Pose Backend Registry

Status: design + implementation for issue #23 (KGM-023). Builds on
[DD-002](DD-002-fullbody-onnx.md).

## Problem

[DD-002](DD-002-fullbody-onnx.md) defined the `PoseBackend` interface and the
ONNX Runtime Web plan. To satisfy the KGM-023 acceptance criterion "one ONNX
model integrated and toggleable at runtime", the app needs a place to register
multiple backends behind one interface and switch between them live, without
loading a heavy model until it is selected.

## Registry

The registry lives in [`src/core/ml.ts`](../../src/core/ml.ts):

- `createPoseBackendRegistry(descriptors)` builds a registry from backend
  descriptors (`name`, lazy `create()` factory, optional `spec`, optional
  `isDefault`).
- `listBackends()` returns the registered names for a settings dropdown.
- `setActiveBackend(name)` lazily instantiates and activates a backend and
  returns it; re-activating reuses the existing instance.
- `getActiveBackend()` / `activeBackendName()` report current state.
- `detect(video, tMs)` delegates to the active backend, so callers never depend
  on which backend is live.

MediaPipe registers as the default (`isDefault: true`); ONNX backends
(`onnx-yolo-pose`, `onnx-rtmpose`) register alongside it and only load their
sessions when the user switches to them. This keeps the privacy property
(on-device inference) and the "MediaPipe stays default, never regresses"
guarantee from DD-002.

## Benchmarking

Backends are compared with `runModelBenchmark` / `summarizeModelBenchmark`
(already in `ml.ts`), which report fps, average/p95 latency, and peak memory.
The committed comparison table lives in
[../benchmarks/onnx-pose-backends.md](../benchmarks/onnx-pose-backends.md);
it is populated from real device runs before any ONNX backend is promoted from
optional to recommended.

## Acceptance criteria (KGM-023)

- [x] Backend interface: `detect(video, t) -> canonical keypoints` (DD-002).
- [x] Runtime toggle: `createPoseBackendRegistry` + `setActiveBackend` select a
  backend live; covered by tests.
- [ ] One ONNX model integrated and benchmarked on real hardware, with the
  benchmark table filled in. This is the remaining hardware-gated step; the
  registry, interface, and benchmark harness are in place. The *model* is no
  longer the open question — [../research/onnx-wholebody-pose.md](../research/onnx-wholebody-pose.md)
  (#269) recommends RTMW-m @256x192 (Apache-2.0, whole-body 133 keypoints) and
  records that it is top-down, so the backend is a detector plus a pose session
  and the fps target must be measured end to end. What remains is the WebGPU
  test device. Issue stays open until then.

## Risks

- WebGPU availability differs by browser; the registry keeps ONNX optional and
  MediaPipe default, so a missing backend degrades to fewer choices, not a
  failure.
- Licensing (AGPL YOLO) is a per-backend selection gate; AGPL models can only be
  user-side plugins, never the shipped default.
