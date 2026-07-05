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

## 3. Deployment targets

- browser WebGPU via ONNX Runtime Web
- browser WASM fallback
- desktop Rust service
- mobile WebView future
- cloud benchmark runner only when user opts in

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

## 5. Training strategy

- start with public object detection models for prototype
- fine-tune small model for sticks and drums
- quantize for edge
- export ONNX
- validate in browser with WebGPU and WASM

## 6. Safety and privacy

- raw videos stay local by default
- dataset upload is opt-in
- blur faces option for drum-only training
- license every dataset entry
