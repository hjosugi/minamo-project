# Target Architecture

> **Relationship to other docs:** [ARCHITECTURE.md](ARCHITECTURE.md)
> describes the architecture as implemented today. This document is the
> target-state pipeline (hands, drums, custom ML backends, Erlang/Elixir
> routing) that the backlog builds toward.

## 1. Overview

KGM1 is a local-first realtime tracking pipeline.

```text
Webcam / mic
  -> capture scheduler
  -> ML inference adapters
      -> Face Landmarker
      -> Hand Landmarker
      -> Pose Landmarker
      -> YOLO / ONNX custom detectors
  -> signal normalization
  -> quality gate
  -> stabilizer
      -> One Euro Filter
      -> Kalman / temporal prediction
      -> anatomy constraints
      -> occlusion recovery
      -> avatar rig constraints
  -> derived signals
      -> per-finger states
      -> eye and mouth states
      -> drum hit events
  -> KGM1 frame encoder
  -> local renderer / OBS / WebTransport
```

## 2. Major subsystems

### 2.1 Capture

Responsibilities:

- choose camera
- set resolution and FPS
- mirror preview without corrupting handedness
- timestamp each frame with source and monotonic clocks
- detect dropped frames
- expose calibration images

### 2.2 Inference adapters

Adapters isolate ML libraries from KGM1.

Initial adapters:

- MediaPipe Tasks Hand Landmarker
- MediaPipe Tasks Face Landmarker
- MediaPipe Pose Landmarker
- audio onset detector

Future adapters:

- YOLO stick/drum detector
- ONNX Runtime Web WebGPU detector
- custom segmentation model
- multi-camera fusion
- optional phone camera / IMU companion

### 2.3 Stabilizer

The stabilizer is the product's core differentiator.

It must prevent:

- jitter
- broken fingers
- inverted elbows
- sudden face blendshape spikes
- mouth flicker
- wrong left/right hand swaps
- stick teleporting
- drum false hits

### 2.4 Retargeting

Retargeting converts KGM1 normalized values to avatar-specific parameters.

Targets:

- VRM 1.0 humanoid / expressions
- Live2D Cubism parameters
- Inochi2D / Inox2D parameters
- custom 2D rigs
- OBS browser source overlays

### 2.5 Transport

Default is local preview. Remote mode uses KGM1 frames.

- Debug: JSON over WebSocket
- Realtime: KGM1B over WebTransport datagrams
- Reliable control: WebTransport streams
- Fallback: WebSocket binary frames

### 2.6 Server/router

The router should not need raw video.

- Erlang/OTP supervises sessions, rooms, presence, fanout, backpressure.
- Rust handles codec, hot paths, optional QUIC/WebTransport implementation.
- Browser clients remain capable of standalone local-only operation.

## 3. Data flow details

### 3.1 Raw frame

```ts
interface CaptureFrame {
  videoFrame: VideoFrame | HTMLVideoElement | ImageBitmap;
  sourceTimeNs: bigint;
  monotonicTimeNs: bigint;
  width: number;
  height: number;
  mirroredPreview: boolean;
}
```

### 3.2 Raw inference

Each model returns raw landmarks and confidence. No avatar-specific smoothing is done here.

### 3.3 Normalized tracking state

Normalized state is independent from any avatar.

### 3.4 Stabilized tracking state

This state is safe for animation. It can be recorded, streamed, or rendered.

## 4. Threading model

Browser MVP:

- main thread: UI and minimal orchestration
- worker: model inference and KGM1 frame construction
- optional worker: transport
- OffscreenCanvas: future rendering path

Native/desktop future:

- Rust service: camera + inference + codec
- Erlang node: session routing
- Web UI: control surface

## 5. Quality gates

A frame is renderable only if it passes:

- timestamp monotonicity
- finite numeric checks
- confidence threshold
- anatomy validity
- velocity limits
- avatar rig validity

If a signal fails, only that signal is degraded. The whole avatar should not freeze unless global confidence is too low.

## 6. Product modes

| Mode | Description |
|---|---|
| Beginner streamer | Webcam + browser + OBS Browser Source |
| Creator studio | High quality avatar calibration and presets |
| Drummer mode | Drum kit calibration, stick/hit tracking, audio sync |
| Remote performer | WebTransport motion streaming |
| Research mode | Dataset capture, benchmark, model comparison |
| Offline privacy mode | No network, all local inference |

## 7. Non-goals for MVP

- full custom model training UI
- perfect multi-camera 3D reconstruction
- production WebTransport server
- marketplace/payment system
- automatic rigging for every avatar format

These are documented as future issues.
