# YOLO / Edge ML Roadmap

## 1. Why custom models are needed

MediaPipe gives strong generic face/hand/pose tracking. The product needs custom models for:

- drum sticks
- drum kit pieces
- hand-object contact
- motion-blurred sticks
- avatar-specific props
- low-light recovery

## 2. Model tasks

| Task | Model type | Output |
|---|---|---|
| stick detection | object detection / segmentation | stick boxes, masks, tips |
| drum piece detection | object detection | snare, hihat, tom, cymbal zones |
| hand-object contact | classifier | contact probability |
| occlusion recovery | temporal model | predicted landmarks |
| quality classifier | lightweight classifier | low light, blur, bad framing |

## 2.1 MediaPipe Tasks vs custom ONNX

| Area | MediaPipe Tasks | Custom ONNX path |
|---|---|---|
| face and hands | default path; strong browser support | only if a specialized model beats current stability |
| stick detection | no dedicated model | preferred path for drum sticks |
| full-body pose | good baseline | optional higher-accuracy backend for KGM-023 |
| deployment | simple CDN/local `.task` files | needs model hash, provider selection, and quantized variants |

Decision: keep MediaPipe as the default privacy-preserving tracker and add ONNX backends only behind explicit model specs.

## 3. Deployment targets

- browser WebGPU via ONNX Runtime Web
- browser WASM fallback
- desktop Rust service
- mobile WebView future
- cloud benchmark runner only when user opts in

Runtime contract:

- `OnnxModelSpec` records URL, input shape, outputs, optional SHA-256, quantization, and preferred providers.
- `chooseExecutionProvider()` tries WebGPU first and falls back to WASM.
- Model load must call `verifyModelHash()` when an expected hash is present.

## 4. Dataset plan

Collect only with explicit consent.

Required labels:

- stick box
- stick tip
- drum piece polygon
- hand/finger visible/occluded
- hit timestamp
- hit zone
- audio onset

Privacy-preserving capture:

- default export is landmarks/labels only, rounded to 4 decimals
- raw frames are opt-in and local until a contributor explicitly uploads
- every record carries a label and dataset license
- face blurring is required for drum-only video exports

## 5. Training strategy

- start with public object detection models for prototype
- fine-tune small model for sticks and drums
- quantize for edge
- export ONNX
- validate in browser with WebGPU and WASM

Export manifest:

```json
{
  "schema": "minamo.model-export.v1",
  "modelName": "stick-yolo-n",
  "format": "onnx",
  "quantization": "int8",
  "inputShape": [1, 3, 320, 320],
  "outputs": ["boxes", "scores"],
  "sha256": "<hex>"
}
```

Benchmark harness output is `ModelBenchmarkResult`: fps, average latency, p95 latency, backend, and optional memory high-water mark.

## 6. Safety and privacy

- raw videos stay local by default
- dataset upload is opt-in
- blur faces option for drum-only training
- license every dataset entry

## 7. Research notes

YOLO-style stick detection should be evaluated first because stick tips are small, fast, and often motion-blurred. A full custom hand pipeline should wait until it beats MediaPipe on a fixed clip set; otherwise it increases maintenance for no user-visible gain.

Phone companion capture is useful when the desktop camera angle is poor. Multi-camera fusion is useful later, but it should start as timestamped independent KGM streams rather than raw video fusion.

Optional IMU sticks can improve fast-roll timing, but they introduce hardware cost and pairing UX. Treat IMU data as an auxiliary confidence boost, not a requirement.
