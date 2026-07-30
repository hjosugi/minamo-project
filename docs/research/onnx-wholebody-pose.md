<!-- i18n: language-switcher -->
[English](onnx-wholebody-pose.md) | [日本語](onnx-wholebody-pose.ja.md)

# Research: RTMW / RTMW3D as the ONNX Whole-Body Pose Model

Status: research pass for issue #269. Narrows the model choice that #222 needs
before it can select "one distributable model".
Related: #23 (full-body ONNX), #222 (backend integration),
[../design/DD-002-fullbody-onnx.md](../design/DD-002-fullbody-onnx.md),
[../design/DD-009-onnx-backend-registry.md](../design/DD-009-onnx-backend-registry.md).

## Goal

Decide whether RTMW (2D whole-body, 133 keypoints) or RTMW3D (monocular 3D) is
the model #222 should integrate, in preference to the YOLO11-pose and RTMPose
candidates DD-002 named, and answer the question #269 actually cares about: can
one whole-body model replace the separate pose and hand models the tracker runs
today?

This pass is documentation-level. It settles what can be settled from upstream
sources and states precisely what still needs a device run, because #222's
closing criteria are measurements this repo cannot produce without the recorded
mid-range dGPU.

## Acceptance criteria

- [x] The goal is clear.
- [x] Acceptance criteria are clear.
- [x] Does not contradict the existing design: RTMW would register as one more
  optional backend behind DD-009's registry; MediaPipe stays the default and the
  face pipeline is untouched.
- [x] Model family, licence, keypoint layout, variants and architecture recorded
  from upstream, with the discrepancies noted rather than smoothed over.
- [x] Written recommendation, and the consequence for #222's "one model" framing.
- [ ] Export RTMW-m / RTMW3D to ONNX and record hashes, input shapes, and
  pre/post-processing. **Not done** — needs the mmpose/mmdeploy toolchain, and
  the byte-level facts (hash, file size) are worthless if not taken from the
  artefact that actually ships.
- [ ] Benchmark against YOLO11-pose per the #222 protocol. **Not done** —
  hardware-gated (Windows, mid-range dGPU, WebGPU without flags).
- [ ] Hand-keypoint quality against MediaPipe Hand Landmarker on the golden
  clips. **Not done** — requires running both models.
- [ ] Seated / side / occluded rubric. **Not done** — requires the clips.

## Findings

### Family, licence, layout

- RTMW extends RTMPose to the **COCO-WholeBody 133-keypoint** layout: 17 body,
  6 feet, 68 face, 42 hands (21 per hand). The paper describes coverage as "the
  face, torso, hands, and feet".
- **Apache-2.0**, inside mmpose, with ONNX / TensorRT / TorchScript exports and
  model-zoo download. This clears the licensing gate that rules YOLO11-pose out
  of the default build (AGPL, per DD-002 and DD-009).
- Variants and reported COCO-WholeBody mAP, as listed upstream at time of
  reading (2026-07-30):

  | Variant | Input | mAP | FLOPs |
  |---|---|---|---|
  | RTMW-m | 256×192 | 58.2 | 4.3G |
  | RTMW-l | 256×192 | 66.0 | 7.9G |
  | RTMW-x | 256×192 | 67.2 | 13.1G |
  | RTMW-l | 384×288 | 70.1 | 17.7G |
  | RTMW-x | 384×288 | 70.2 | 29.3G |

- **The 70.2 figure is attributed inconsistently upstream** and #269's own
  summary inherits one side of it. The paper abstract claims "RTMW-l achieving a
  70.2 mAP … the first open-source model to exceed 70 mAP"; the project README
  table attributes 70.1 to RTMW-l@384×288 and 70.2 to RTMW-x@384×288. Confirm
  the variant against the exported artefact before quoting a number in
  [../benchmarks/onnx-pose-backends.md](../benchmarks/onnx-pose-backends.md).
- Architecture: RTMPose backbone plus FPN and a Hierarchical Encoding Module,
  trained on the Cocktail14 dataset collection with two-stage distillation.
  Localization uses the **SimCC** codec — two independent 1-D classification
  heads (X and Y) instead of 2-D heatmaps, so post-processing is an argmax over
  1-D bins. That is cheap and portable, which matters more for an ORT Web
  post-process than raw accuracy does.

### It is top-down, so it is two sessions, not one

RTMW inherits RTMPose's **top-down** pipeline: a person detector runs first
(RTMDet-nano upstream), and the pose model runs on the resulting crop. This is
the single most consequential finding for #222, whose first checkbox reads
"select one distributable model":

- A working backend needs **two** ONNX artefacts, each with its own licence,
  hash, input shape and pre/post-processing.
- The 30 fps acceptance target has to be measured **end to end**, detector plus
  pose, not on the pose model alone. DD-009's `detect(video, t)` interface hides
  the two stages from callers, which is the right shape, but it also makes it
  easy to benchmark only half the work.
- MediaPipe Pose Landmarker bundles its own detector, so this is a real added
  cost relative to the default, not a like-for-like swap.

An alternative worth testing before accepting the detector stage: reuse the
MediaPipe pose bounding box as the crop provider when both backends are live.
That is cheaper than a second ONNX session but couples the ONNX backend to the
default one, so it cannot be the only path.

### One model replaces two of three, not three of three

This is the question #269 asks, and the answer is a qualified yes:

- **Pose (33 → 17+6)**: RTMW can replace MediaPipe Pose Landmarker. Note it
  gives *fewer* body points than BlazePose's 33; the tracker only carries 7
  (`POSE_POINTS` in `shared/blendshapes.js`), so the count is not the issue.
- **Hands (21 per hand)**: RTMW's per-hand layout is the same size as MediaPipe
  Hand Landmarker's 21, so `shared/hand-math.js` (`fingerCurl`, `fingerSpread`,
  `fingerVector`) could consume it — **provided the index ordering matches**,
  which must be verified against the exported model, not assumed.
- **Face: no.** RTMW's 68 face points are *landmarks*. KGM1 carries 52 ARKit
  **blendshapes**, which MediaPipe Face Landmarker produces directly and which
  drive the whole expression path. Landmarks are not blendshapes and deriving
  the latter from the former is a separate modelling problem. The face pipeline
  stays on MediaPipe regardless of which pose backend wins.

So RTMW is a candidate to collapse two of the three current MediaPipe tasks,
and the headline "one model for body + hands + face" does not translate into
this application.

### The world-coordinate gap is unchanged

DD-002 already records that 2D-only models lose the metric world landmarks
BlazePose supplies, and that the lifting step gates KGM-024. RTMW 2D does not
change that. RTMW3D is the reason #269 raised the family — monocular 3D
whole-body via the same coordinate-classification approach — but it is heavier,
its 3D accuracy claim needs its own evaluation against the seated-depth rubric,
and no size or speed figures for it were recorded upstream alongside the 2D
table. It should not be the first thing integrated.

### Integration constraints found while probing

- ORT Web's WebGPU execution provider shipped in ONNX Runtime 1.17; the current
  release is **1.27.0**, so #222's "use the WebGPU entrypoint" is well
  supported.
- `onnxruntime-web@1.27.0` installs at roughly **133 MB** on disk and pulls
  `protobufjs`, which runs a **postinstall script**. `pnpm-workspace.yaml`
  currently allows install scripts for `esbuild` only, and
  [../DEPENDENCY_POLICY.md](../DEPENDENCY_POLICY.md) states that changes to that
  allow-list require supply-chain review. Adding this dependency is therefore a
  reviewed decision, not a mechanical step, and #222 should treat it as one.
- The desktop CSP already permits what ORT Web needs — `script-src` includes
  `'wasm-unsafe-eval'` and `connect-src` allows `https:` — so no CSP change is
  expected for model or WASM fetches.
- Model weights would follow the existing vendoring path:
  `scripts/fetch-models.sh` plus the pinned digests in
  `scripts/model-pins.sha256`, which already verifies by default and regenerates
  only under `--update-pins` (#260).
- Upstream publishes FLOPs but not artefact size in MB. Download budget is the
  binding constraint for a web app, so file size must be captured at export
  time; it is not available from the documentation.

## Decision

**Recommend RTMW-m @256×192 as the model #222 integrates first**, with these
qualifications, and keep RTMW3D out of the first pass.

Reasons: it is the only candidate that is simultaneously permissively licensed
(Apache-2.0, unlike AGPL YOLO11-pose), officially exported to ONNX, and able to
supply hands and body from one inference; and its SimCC post-process is a 1-D
argmax rather than heatmap decoding or NMS, which is the least code to get wrong
in a browser backend. RTMW-m is the entry point because it is the smallest at
4.3G FLOPs — but its 58.2 mAP is far below the 70-point headline, so if the
seated rubric fails on `-m`, the next step is `-l@256×192` (66.0, 7.9G), not the
384×288 variants, which are 2–4× the compute for the last few points.

Consequences #222 should absorb:

1. Its "one distributable model" checkbox becomes **two** artefacts — detector
   plus pose — each needing licence, hash, shape and pre/post-processing
   recorded, and the fps target measured end to end.
2. It replaces the pose and (pending index-order verification) hand models. It
   does not touch the face pipeline, and the issue should not imply otherwise.
3. Adding `onnxruntime-web` requires widening the install-script allow-list,
   which `DEPENDENCY_POLICY.md` routes through supply-chain review before any
   code lands.

Left open deliberately: every measured quantity. Export hashes, artefact sizes,
fps, p95 latency, VRAM, hand-keypoint agreement with MediaPipe, and the
seated / side / occluded rubric all require the device and clips named in #222,
so [../benchmarks/onnx-pose-backends.md](../benchmarks/onnx-pose-backends.md)
keeps `pending` in those cells rather than an estimate. A number nobody measured
is worse than an empty cell, because the empty cell is honest about the gate.

## Sources

- RTMW: Real-Time Multi-Person 2D and 3D Whole-body Pose Estimation —
  <https://arxiv.org/abs/2407.08634>
- mmpose RTMPose project (variant table, exports, licence) —
  <https://github.com/open-mmlab/mmpose/tree/main/projects/rtmpose>
- RTMPose (SimCC codec, RTMDet detector pairing) —
  <https://arxiv.org/abs/2303.07399>
- ONNX Runtime Web WebGPU availability —
  <https://opensource.microsoft.com/blog/2024/02/29/onnx-runtime-web-unleashes-generative-ai-in-the-browser-using-webgpu/>
