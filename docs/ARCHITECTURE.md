<!-- i18n: language-switcher -->
[English](ARCHITECTURE.md) | [日本語](ARCHITECTURE.ja.md)

# Minamo Architecture

## Goal

Anyone with a normal webcam and a browser can drive a 2D or 3D avatar with
low latency and near-zero bandwidth. No iPhone, no depth sensor, no install.

## Principles

1. **Inference at the edge.** The camera image never leaves the user's
   machine. Only motion parameters go on the wire. This is a privacy
   property and a bandwidth property at the same time.
2. **Parametric motion, not video.** A tracked face is ~76 bytes per frame
   (see docs/PROTOCOL.md). Send parameters; render anywhere.
3. **Unreliable transport for real-time state.** A late tracking frame is a
   useless tracking frame. WebTransport datagrams drop instead of
   retransmitting, which keeps worst-case latency bounded.
4. **Model-agnostic protocol.** KGM1 carries a canonical ARKit-52 channel
   set. The tracker backend (MediaPipe today, YOLO-pose or RTMPose tomorrow)
   can change without touching the renderer or the relay.

## Pipeline

```
 webcam 720p/60
    |
    v
 MediaPipe Face Landmarker (WASM + GPU delegate, in-browser)
    |  478 landmarks, 52 blendshapes, 4x4 head transform
    v
 Solver          head quaternion + position, mirror resolution
    |
    v
 One Euro filter (per channel: 52 weights, quat, position)
    |
    v
 KGM1 encoder    76-119 bytes/frame
    |
    +---------------------------+----------------------------+
    v                           v                            v
 BroadcastChannel          WebSocket relay             WebTransport relay
 (same browser)            (relay-node, Node.js)       (relay-rs, Rust/QUIC)
    |                           |                            |
    v                           v                            v
 Viewer: decode -> ease toward targets -> apply to VRM / built-in bot
         (three.js + @pixiv/three-vrm; spring bones via vrm.update)
```

## Latency budget (target, local network)

| Stage | Budget |
|---|---|
| Camera capture + queue | 8-16 ms |
| Face Landmarker inference (GPU) | 6-12 ms |
| Solve + filter + encode | < 1 ms |
| WebTransport datagram, LAN | < 2 ms |
| Viewer easing + render | 8-16 ms |
| **Glass-to-glass** | **~25-45 ms** |

One Euro filtering adds effective lag only during slow motion, which is
exactly when lag is invisible. That is why it is the standard choice.

## Why these components

- **MediaPipe Face Landmarker** is the strongest openly available webcam
  face model today: 52 ARKit-compatible blendshapes plus a metric head
  transform, running at 60 fps on integrated GPUs via WASM. It replaces the
  older landmark-to-blendshape heuristics that Kalidokit had to do by hand.
- **WebTransport (QUIC)** gives datagrams to the browser. WebSocket cannot
  drop a frame; TCP retransmission turns one lost packet into a latency
  spike for everything behind it. The relay in Rust (`wtransport`) keeps
  the fan-out path allocation-light and predictable.
- **Rust for the relay** because the relay is pure I/O fan-out: predictable
  tail latency matters more than developer velocity there.
- **Erlang/Elixir for scale-out** (design doc DD-005): one Rust relay is
  fine for one streamer. Fan-out to thousands of viewers across regions is
  a distribution problem, and BEAM process-per-connection with distributed
  pub/sub (Phoenix.PubSub) is the proven shape for it. The KGM1 payload
  stays opaque bytes; BEAM only routes.
- **three-vrm** for rendering VRM 0.x/1.0 with spring bones and the VRM
  expression system. The 2D path (Inochi2D via inox2d WASM) is design doc
  DD-004.

## Compression strategy

Two different problems:

1. **Motion (continuous, hot path).** Quantization only: i16 quaternion,
   u8 weights, mm positions. Entropy coding is not worth the CPU at 76
   bytes. KGM2 adds smallest-three quat packing and delta frames (DD-006).
2. **Avatar assets (one-time, cold path).** VRM/glTF meshes compress with
   meshoptimizer (EXT_meshopt_compression) or Draco; textures with KTX2 /
   Basis Universal so they stay compressed on the GPU. This is the plan for
   the asset delivery pipeline (backlog KGM-041).

## Relation to prior art

| Project | What it does | What Minamo takes / changes |
|---|---|---|
| Kalidokit | JS solvers from MediaPipe landmarks to rig params | Same role as our solver layer; we use the newer Face Landmarker blendshape output directly instead of heuristic solving |
| OpenSeeFace / VSeeFace | Python UDP tracker + Unity renderer | Same "parameters over the wire" idea; Minamo replaces UDP with WebTransport so it works from a browser |
| VTube Studio | Commercial 2D tracking app | Reference for calibration UX and quality bar |
| Inochi2D / inox2d | 2D puppet format + Rust renderer | Planned 2D render backend (DD-004) |
| moeru-ai/airi | AI VTuber companion stack | Potential consumer of KGM1 frames to drive its avatars |
| handcrafted-persona-engine | Persona/avatar engine | Same; KGM1 is designed to be trivially consumable by engines like this |

## Repository layout

```
minamo/
  index.html          landing hub
  tracker/            webcam -> KGM1 publisher page
  viewer/             KGM1 -> VRM / built-in bot renderer page
  shared/             blendshape canon, filters, codec, transport
  relay-node/         static site + WebSocket relay (compatibility path)
  relay-rs/           WebTransport datagram relay (low-latency path)
  assets/             design system CSS
  docs/               this file, PROTOCOL.md, BACKLOG.md, design/
```
