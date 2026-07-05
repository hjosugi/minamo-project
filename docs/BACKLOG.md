# Minamo Backlog

Issue-ready backlog. Every entry follows the same fixed format so it can be
parsed and registered to GitHub Issues automatically. See
`docs/ISSUE_REGISTRATION_PROMPT.md` for the registration prompt.

Format contract (do not change; the registration script depends on it):

```
### [KGM-NNN] <issue title>
- Labels: <comma-separated labels>
- Priority: P0 | P1 | P2 | P3
- Effort: S | M | L | XL
- Milestone: <milestone name>
- Design doc: <path or "-">

<body: one or more paragraphs>

Acceptance criteria:
- [ ] <criterion>
```

Label taxonomy: `area/tracking`, `area/body`, `area/protocol`,
`area/transport`, `area/render`, `area/audio`, `area/tooling`,
`area/app`, `area/infra`, `area/docs` and `type/feature`, `type/bug`,
`type/chore`, `type/research`.

Milestones: `M0 Foundation`, `M1 Face quality`, `M2 Body and hands`,
`M3 Protocol v2`, `M4 Scale-out`, `M5 Render backends`, `M6 Product`.

---

## M0 Foundation

### [KGM-001] CI pipeline with lint and unit tests for shared modules
- Labels: area/infra, type/chore
- Priority: P0
- Effort: M
- Milestone: M0 Foundation
- Design doc: -

Add GitHub Actions: ESLint + Prettier check, and Node-based unit tests for
`shared/codec.js` (encode/decode roundtrip, clamping, truncated buffers) and
`shared/filters.js` (One Euro convergence, quaternion hemisphere handling).
The codec roundtrip test already exists as an ad-hoc script; move it into a
proper test runner (`node:test`).

Acceptance criteria:
- [ ] `npm test` runs codec and filter tests locally and in CI
- [ ] CI fails on lint errors
- [ ] Roundtrip test covers FACE, FACE+POSE, and empty-blocks frames

### [KGM-002] Codec robustness: fuzz and malformed-packet tests
- Labels: area/protocol, type/chore
- Priority: P1
- Effort: S
- Milestone: M0 Foundation
- Design doc: -

`decodeFrame` must never throw on hostile input: random bytes, truncated
headers, wrong magic, wrong version, oversized point counts. Add a fuzz test
that feeds random and mutated buffers and asserts null-or-valid output.

Acceptance criteria:
- [ ] 1M random buffers decode without exceptions
- [ ] Mutated valid frames (bit flips) decode without exceptions
- [ ] Documented contract: decode returns null on any invalid input

### [KGM-003] Vendor MediaPipe WASM and models locally with SRI
- Labels: area/infra, type/feature
- Priority: P1
- Effort: M
- Milestone: M0 Foundation
- Design doc: -

The tracker currently loads WASM and `.task` models from CDNs. Add a
`scripts/fetch-models.sh` that downloads pinned versions into `vendor/`,
serve them locally, and fall back to CDN if absent. Add Subresource
Integrity hashes for the CDN path. This enables offline use and protects
against upstream changes.

Acceptance criteria:
- [ ] Tracker works with no external network after `fetch-models.sh`
- [ ] CDN fallback keeps working
- [ ] Versions pinned in one place

### [KGM-004] Graceful capability and permission error UX
- Labels: area/tooling, type/feature
- Priority: P0
- Effort: S
- Milestone: M0 Foundation
- Design doc: -

Detect and explain: camera permission denied, no camera device, no WebGL2,
no WebTransport (hide wt mode), insecure context (getUserMedia requires
HTTPS or localhost). Each case gets a specific message and a fix hint in
the stage hint area, not a console error.

Acceptance criteria:
- [ ] Each failure mode shows a specific actionable message
- [ ] wt mode option is disabled when WebTransport is missing
- [ ] Insecure-context case links to the HTTPS dev docs (KGM-012)

### [KGM-005] Camera device, resolution, and frame-rate selector
- Labels: area/tracking, type/feature
- Priority: P1
- Effort: S
- Milestone: M0 Foundation
- Design doc: -

Enumerate devices with `mediaDevices.enumerateDevices`, let the user pick
camera, resolution (480p/720p/1080p) and target fps (30/60), and reopen the
stream live without losing transport connections.

Acceptance criteria:
- [ ] Device list refreshes on `devicechange`
- [ ] Switching devices does not require page reload
- [ ] Chosen constraints are visible in the stats line

### [KGM-006] Persist tracker and viewer settings
- Labels: area/tooling, type/feature
- Priority: P2
- Effort: S
- Milestone: M0 Foundation
- Design doc: -

Persist mode, room, wt url, cert hash, mirror, pose flag, filter preset and
selected camera to localStorage. Restore on load. Add a reset button.

Acceptance criteria:
- [ ] Reload restores the previous session settings
- [ ] Reset returns to defaults

### [KGM-007] Viewer jitter buffer with wrap-aware sequence handling
- Labels: area/render, type/feature
- Priority: P1
- Effort: M
- Milestone: M0 Foundation
- Design doc: -

Datagrams arrive unordered. Keep only the newest frame using `seq` with
16-bit wrap comparison (RFC 1982 style), drop older-than-current frames, and
expose loss/reorder counters to the HUD (KGM-049). The easing constant
should adapt to the measured inbound frame rate so 30 fps sources do not
look laggy and 60 fps sources do not look stiff.

Acceptance criteria:
- [ ] Out-of-order frames never move the avatar backward
- [ ] seq wrap at 65535 -> 0 handled correctly
- [ ] Easing adapts between 24-60 fps sources

### [KGM-008] Room access tokens for relays
- Labels: area/transport, type/feature
- Priority: P1
- Effort: M
- Milestone: M0 Foundation
- Design doc: -

Anyone who knows a room name can publish into it. Add an optional token:
relay is started with a secret, publishers must present `?token=` (ws) or a
path segment (wt). Subscribers optionally too. Constant-time comparison.

Acceptance criteria:
- [x] relay-node and relay-rs both support tokens
- [x] Tracker and viewer UIs have a token field
- [x] Wrong token closes the connection with a clear code

### [KGM-009] relay-rs build and integration test in CI
- Labels: area/infra, type/chore
- Priority: P0
- Effort: M
- Milestone: M0 Foundation
- Design doc: -

The Rust relay is currently shipped as reviewed-but-uncompiled source. Add
CI that runs `cargo build` and an integration test using a native
WebTransport client (wtransport client feature) doing pub -> sub echo of a
KGM1 frame through a room.

Acceptance criteria:
- [x] cargo build + clippy + fmt in CI
- [x] pub/sub integration test passes in CI
- [x] README badge reflects build status

### [KGM-010] relay-rs and relay-node: room garbage collection
- Labels: area/transport, type/bug
- Priority: P1
- Effort: S
- Milestone: M0 Foundation
- Design doc: -

relay-rs never removes entries from the rooms map, so long-running servers
leak one broadcast channel per room name ever used. Remove the entry when
the last participant leaves (receiver_count == 0 and no publisher task).
relay-node already deletes empty rooms; add a test for both.

Acceptance criteria:
- [ ] Rooms map size returns to zero after all clients leave
- [ ] No panic when a client joins during GC

### [KGM-011] Docker compose for one-command self-hosting
- Labels: area/infra, type/feature
- Priority: P2
- Effort: S
- Milestone: M0 Foundation
- Design doc: -

`docker compose up` starts relay-node (static site + ws) and relay-rs
(WebTransport) with sensible ports and a shared token env var. Multi-stage
builds, distroless runtime images.

Acceptance criteria:
- [ ] compose up serves the site and both relays
- [ ] Images build on amd64 and arm64

### [KGM-012] HTTPS local development guide
- Labels: area/docs, type/chore
- Priority: P2
- Effort: S
- Milestone: M0 Foundation
- Design doc: -

getUserMedia requires a secure context off-localhost, and WebTransport
requires HTTPS pages. Document mkcert setup, testing from a phone on LAN,
and Chrome flags that are NOT needed when using serverCertificateHashes.

Acceptance criteria:
- [ ] docs/DEV_HTTPS.md exists and is linked from README
- [ ] Phone-on-LAN walkthrough verified once

## M1 Face quality

### [KGM-013] Neutral-pose and expression range calibration
- Labels: area/tracking, type/feature
- Priority: P0
- Effort: L
- Milestone: M1 Face quality
- Design doc: docs/design/DD-008-calibration-retargeting.md

Faces differ: some users' `jawOpen` never exceeds 0.6, some rest at
`browDownLeft` 0.15. Add a guided calibration (neutral hold, then max
expressions) that computes per-channel offset and gain, applied before
filtering. Store per profile.

Acceptance criteria:
- [x] 30-second guided flow produces offset/gain per channel
- [x] Calibrated neutral shows all channels < 0.05
- [x] Profiles can be saved, loaded, exported as JSON

### [KGM-014] Interactive mixer: per-channel gain, deadzone, and mute
- Labels: area/tracking, type/feature
- Priority: P1
- Effort: M
- Milestone: M1 Face quality
- Design doc: docs/design/DD-008-calibration-retargeting.md

Make the 52-channel meter panel interactive: drag on a channel to set gain,
right-click or long-press to mute, small deadzone slider. This is the
manual complement to KGM-013 and doubles as the debugging surface.

Acceptance criteria:
- [x] Gain 0-2x and deadzone 0-0.2 per channel
- [x] Settings persist and export with the calibration profile
- [x] Muted channels render dimmed in the meters

### [KGM-015] Low-light robustness and signal quality indicator
- Labels: area/tracking, type/feature
- Priority: P2
- Effort: M
- Milestone: M1 Face quality
- Design doc: -

Estimate input quality (mean luma, landmark confidence variance) and show a
signal quality chip. Below a threshold, suggest fixes (light, camera). Try
`exposureMode`/`brightness` constraints where supported.

Acceptance criteria:
- [x] Quality chip: good / degraded / poor with reasons
- [x] No false "poor" in normal indoor lighting

### [KGM-016] True gaze from iris landmarks
- Labels: area/tracking, type/feature
- Priority: P1
- Effort: L
- Milestone: M1 Face quality
- Design doc: -

Current gaze derives from eyeLook* blendshapes, which saturate and mix with
blinks. Face Landmarker outputs iris landmarks (468-477); compute a gaze
vector from iris center vs eye contour, calibrate with a 5-point look
target flow, and feed the viewer lookAt with it (new optional KGM2 field).

Acceptance criteria:
- [x] Gaze tracks a moving on-screen target within ~5 deg after calibration
- [x] Blink does not spike gaze
- [x] Falls back to blendshape gaze when iris is unavailable

### [KGM-017] Head distance mapping and position stabilization
- Labels: area/tracking, type/feature
- Priority: P2
- Effort: S
- Milestone: M1 Face quality
- Design doc: -

Map head z-translation to a subtle avatar lean-in/lean-out with configurable
range, and clamp position drift with a slow re-centering term so the avatar
stays framed during long streams.

Acceptance criteria:
- [x] Lean range configurable 0-20 cm, default subtle
- [x] One-hour session shows no visible drift

### [KGM-018] Blink hysteresis and wink disambiguation
- Labels: area/tracking, type/feature
- Priority: P1
- Effort: M
- Milestone: M1 Face quality
- Design doc: -

Webcam blendshapes cross-talk between eyes: a wink often reads as 0.7/0.4.
Add a small state machine: hysteresis thresholds for open/closed, and a
wink classifier (one eye clearly lower than the other for N frames) that
snaps the open eye to open.

Acceptance criteria:
- [x] Deliberate winks register as winks >90% in a 50-trial manual test
- [x] Normal blinks stay symmetric
- [x] No flicker at half-closed eye positions

### [KGM-019] Filter presets and live tuning panel
- Labels: area/tracking, type/feature
- Priority: P2
- Effort: S
- Milestone: M1 Face quality
- Design doc: -

Expose One Euro (minCutoff, beta) as presets: "responsive", "balanced",
"smooth", plus an advanced panel with sliders and a live latency/jitter
readout so users can see the tradeoff.

Acceptance criteria:
- [ ] Three presets switchable while tracking
- [ ] Advanced sliders apply without restart

### [KGM-020] Tracking-loss fade and re-acquisition easing
- Labels: area/tracking, type/bug
- Priority: P1
- Effort: S
- Milestone: M1 Face quality
- Design doc: -

When the face is lost (occlusion, leaving frame) the last frame freezes;
on re-acquire the avatar snaps. Fade weights toward neutral over ~400 ms on
loss, reset filters on re-acquire, and ease back over ~250 ms.

Acceptance criteria:
- [ ] Covering the camera relaxes the avatar to neutral smoothly
- [ ] Re-entry produces no snap

### [KGM-021] Multi-face selection policy
- Labels: area/tracking, type/bug
- Priority: P2
- Effort: S
- Milestone: M1 Face quality
- Design doc: -

With two people in frame, tracking can jump between faces. Track the face
whose bounding area overlaps the previously tracked one (sticky), fall back
to largest. Add an optional face-lock rectangle.

Acceptance criteria:
- [ ] A second person passing behind does not steal tracking
- [ ] Lock region persists across sessions

## M2 Body and hands

### [KGM-022] Hand tracking and KGM2 hand block
- Labels: area/body, type/feature
- Priority: P1
- Effort: XL
- Milestone: M2 Body and hands
- Design doc: docs/design/DD-001-hand-tracking.md

MediaPipe Hand Landmarker (21 landmarks x2 hands) -> per-finger curl +
wrist pose -> KGM2 HAND block -> VRM finger bones. See design doc for the
solver, the encoding (16 bytes/hand target), and scheduling (hands at 30
fps interleaved with face at 60).

Acceptance criteria:
- [ ] Open/close/point/peace read correctly on VRM fingers
- [ ] Face fps does not drop below 50 with hands enabled on a mid GPU
- [ ] Hands absent -> block omitted, zero cost

### [KGM-023] Full-body backend via ONNX Runtime Web (YOLO11-pose / RTMPose)
- Labels: area/body, type/research
- Priority: P2
- Effort: XL
- Milestone: M2 Body and hands
- Design doc: docs/design/DD-002-fullbody-onnx.md

Evaluate and integrate a stronger pose backend running on WebGPU through
ONNX Runtime Web, behind the same solver interface as MediaPipe. Target:
full-body 26+ keypoints at 30 fps on a mid-range dGPU. Design doc covers
model candidates, licensing, quantization (fp16/int8), and the backend
abstraction.

Acceptance criteria:
- [ ] Backend interface: `detect(video, t) -> canonical keypoints`
- [ ] One ONNX model integrated and toggleable at runtime
- [ ] Benchmark table (fps, VRAM) committed to docs

### [KGM-024] Arm rotation solver (upgrade experimental pose)
- Labels: area/body, type/feature
- Priority: P1
- Effort: L
- Milestone: M2 Body and hands
- Design doc: docs/design/DD-001-hand-tracking.md

Replace the shoulder-sway placeholder: solve upper-arm and forearm
rotations from shoulder/elbow/wrist world points (Kalidokit-style), with
joint limits, hemisphere disambiguation, and per-bone smoothing. Feed VRM
normalized bones.

Acceptance criteria:
- [ ] Waving, crossing arms, and resting pose look plausible on VRM
- [ ] No elbow pop when the wrist passes near the shoulder
- [ ] Toggle falls back cleanly to sway-only mode

### [KGM-025] Seated/standing modes and hip anchoring
- Labels: area/body, type/feature
- Priority: P2
- Effort: M
- Milestone: M2 Body and hands
- Design doc: -

Streamers sit. Add a seated mode that ignores lower-body noise, anchors
hips, and derives lean from the shoulder midpoint. Standing mode maps hip
translation within a small range.

Acceptance criteria:
- [ ] Seated mode shows no leg jitter when legs are off-frame
- [ ] Mode persists per profile

### [KGM-026] Finger curl to VRM finger bones mapping
- Labels: area/body, type/feature
- Priority: P2
- Effort: M
- Milestone: M2 Body and hands
- Design doc: docs/design/DD-001-hand-tracking.md

Map per-finger curl values (0-1) plus thumb opposition onto the 15 VRM
finger bones per hand with natural coupling curves (proximal leads,
distal follows).

Acceptance criteria:
- [ ] Curl 0/0.5/1 produce natural open/half/fist
- [ ] Works on VRM0 and VRM1 models

## M3 Protocol v2

### [KGM-027] KGM2: smallest-three quaternion packing
- Labels: area/protocol, type/feature
- Priority: P2
- Effort: M
- Milestone: M3 Protocol v2
- Design doc: docs/design/DD-006-kgm2.md

Pack quaternions as smallest-three (2 bits index + 3x10 bits) = 4 bytes
instead of 8, halving rotation cost ahead of hand/body blocks that carry
many quaternions.

Acceptance criteria:
- [ ] Max angular error < 0.5 deg over 1M random rotations
- [ ] JS encode+decode < 1 us per quat

### [KGM-028] KGM2: delta frames with periodic keyframes
- Labels: area/protocol, type/feature
- Priority: P2
- Effort: L
- Milestone: M3 Protocol v2
- Design doc: docs/design/DD-006-kgm2.md

Most channels barely change between frames. Encode deltas against the last
keyframe with a keyframe every N frames (loss recovery bound). Target ~40%
size reduction on typical face streams. Must stay stateless enough that
loss only degrades until the next keyframe.

Acceptance criteria:
- [ ] Average frame size reduced >= 35% on a recorded session corpus
- [ ] 10% random loss recovers within one keyframe interval
- [ ] Decoder rejects deltas whose base keyframe was never seen

### [KGM-029] KGM2: sparse channel mask
- Labels: area/protocol, type/feature
- Priority: P3
- Effort: M
- Milestone: M3 Protocol v2
- Design doc: docs/design/DD-006-kgm2.md

A 52-bit (7-byte) presence mask so encoders can send only channels above a
change threshold. Combines with deltas; useful for low-power mode.

Acceptance criteria:
- [ ] Masked frames decode with unchanged channels held
- [ ] Idle-face frames drop below 30 bytes

### [KGM-030] Sender clock sync for multi-source scenes
- Labels: area/protocol, type/feature
- Priority: P3
- Effort: M
- Milestone: M3 Protocol v2
- Design doc: -

For collab rooms (KGM-043) the viewer mixes sources with independent
clocks. Add a lightweight offset estimation (relay echoes receive time, or
NTP-style probe frames) so sources can be aligned within ~10 ms.

Acceptance criteria:
- [ ] Two sources on one screen show no visible phase offset
- [ ] Works over both ws and wt

### [KGM-031] Reference codec implementations in Rust and Python
- Labels: area/protocol, type/chore
- Priority: P2
- Effort: M
- Milestone: M3 Protocol v2
- Design doc: -

Ship `kgm-codec` crates/packages so relays can inspect frames and tools
(recorder, analytics) can be written outside the browser. Cross-language
golden-vector tests generated from the JS implementation.

Acceptance criteria:
- [ ] Rust and Python decode the JS golden vectors bit-exactly
- [ ] Published as workspace members, not to registries yet

## M4 Scale-out

### [KGM-032] Elixir clustered relay for large fan-out
- Labels: area/transport, type/feature
- Priority: P2
- Effort: XL
- Milestone: M4 Scale-out
- Design doc: docs/design/DD-005-elixir-relay-cluster.md

One Rust relay covers one streamer's room. For thousands of viewers across
regions, build a BEAM cluster: Phoenix.PubSub for inter-node fan-out, edge
nodes terminating WebTransport (via a Rust NIF or sidecar) or WebSocket
natively. KGM frames stay opaque binaries. See design doc for topology,
backpressure, and the Rust-sidecar-vs-NIF decision.

Acceptance criteria:
- [ ] 1 publisher -> 5,000 subscribers across 3 nodes, p99 relay latency < 30 ms (lab)
- [ ] Node loss drops only that node's subscribers
- [ ] Load test harness committed

### [KGM-033] relay-rs observability: metrics and structured logs
- Labels: area/transport, type/chore
- Priority: P2
- Effort: S
- Milestone: M4 Scale-out
- Design doc: -

Prometheus endpoint: rooms, connections, datagrams in/out, drop counters,
fan-out latency histogram. tracing-subscriber JSON logs.

Acceptance criteria:
- [ ] /metrics scrapeable
- [ ] Grafana dashboard JSON committed

### [KGM-034] Congestion-aware newest-only delivery per subscriber
- Labels: area/transport, type/feature
- Priority: P1
- Effort: M
- Milestone: M4 Scale-out
- Design doc: -

A slow subscriber should receive the newest frame, not a growing queue.
Replace the per-room broadcast buffer semantics for subscribers with a
1-slot mailbox (latest frame wins) and drop counters.

Acceptance criteria:
- [ ] Artificially slowed subscriber stays < 1 frame behind on reconnect-free stream
- [ ] Fast subscribers unaffected (no added latency)

### [KGM-035] MoQ (Media over QUIC) distribution evaluation
- Labels: area/transport, type/research
- Priority: P3
- Effort: L
- Milestone: M4 Scale-out
- Design doc: -

Evaluate mapping KGM streams onto MoQ tracks/objects for CDN-scale relayed
delivery. Deliverable is a written evaluation and a prototype against a
public MoQ relay, not production code.

Acceptance criteria:
- [ ] Report: mapping design, latency measurements, go/no-go recommendation

### [KGM-036] Automatic transport negotiation and downgrade
- Labels: area/transport, type/feature
- Priority: P1
- Effort: M
- Milestone: M4 Scale-out
- Design doc: -

Client tries wt, falls back to ws automatically (UDP-blocked networks,
Safari). Reconnect with exponential backoff, session resume by room+token,
and a visible "degraded transport" indicator.

Acceptance criteria:
- [ ] Blocking UDP flips an active session to ws within 3 s
- [ ] UI shows the active transport truthfully

### [KGM-037] End-to-end encryption of tracking frames
- Labels: area/transport, type/feature
- Priority: P3
- Effort: L
- Milestone: M4 Scale-out
- Design doc: -

Motion data is biometric-adjacent; relays should not need to read it.
Room-key E2EE: XChaCha20-Poly1305 via WebCrypto/libsodium.js, key shared
out-of-band (room URL fragment). Relays forward opaque ciphertext; seq and
timestamp move inside the sealed payload, a minimal outer header remains.

Acceptance criteria:
- [ ] Relay cannot decode frames (test asserts ciphertext)
- [ ] Overhead <= 24 bytes/frame
- [ ] Wrong-key subscriber shows a clear error, not garbage motion

## M5 Render backends

### [KGM-038] Inochi2D backend via inox2d WASM
- Labels: area/render, type/feature
- Priority: P2
- Effort: XL
- Milestone: M5 Render backends
- Design doc: docs/design/DD-004-inochi2d.md

Render `.inp/.inx` 2D puppets in the viewer by compiling inox2d to WASM
(wgpu/WebGL backend) and mapping KGM channels to Inochi2D parameters. This
is the high-quality 2D path that makes Minamo cover the Live2D-style use
case with an open format.

Acceptance criteria:
- [ ] A sample Inochi2D puppet loads and follows head + blink + mouth
- [ ] Backend selectable per avatar file extension
- [ ] Parameter mapping editable and exportable (shares KGM-044 format)

### [KGM-039] Layered-PNG pseudo-2.5D mode (PNGTuber tier)
- Labels: area/render, type/feature
- Priority: P2
- Effort: L
- Milestone: M5 Render backends
- Design doc: -

Zero-asset-cost avatars: user drops a PSD or layered PNGs (body, eyes open/
closed, mouth open/closed, brows). Head yaw/pitch drive parallax offsets
per layer, blink and jawOpen switch layers, with squash-and-stretch easing.

Acceptance criteria:
- [ ] PSD import (ag-psd) with layer-name conventions documented
- [ ] Blink/mouth switching synced with tracking
- [ ] Parallax depth per layer adjustable

### [KGM-040] OBS-ready output: transparency and preset URLs
- Labels: area/render, type/feature
- Priority: P0
- Effort: S
- Milestone: M5 Render backends
- Design doc: -

Viewer query params: `?bg=transparent` (alpha canvas + no floor), `?hud=0`,
locked camera. Document the OBS Browser Source recipe (custom CSS,
resolution). This single issue makes Minamo usable in real streams.

Acceptance criteria:
- [ ] Transparent background verified in OBS Browser Source
- [ ] HUD fully hidden with `?hud=0`
- [ ] README section with copy-paste OBS settings

### [KGM-041] Avatar asset pipeline: meshopt/Draco + KTX2
- Labels: area/render, type/feature
- Priority: P3
- Effort: L
- Milestone: M5 Render backends
- Design doc: -

For hosted avatars, add a CLI (`minamo-pack`) that runs gltfpack
(EXT_meshopt_compression) or Draco plus KTX2/BasisU texture encoding on
VRM files, and wire the corresponding three.js loaders in the viewer.
Typical VRM shrinks 60-80% and textures stay compressed on GPU.

Acceptance criteria:
- [ ] Packed VRM loads in viewer with identical appearance
- [ ] Size and GPU-memory before/after table in docs
- [ ] Spring bone and expression data survive the pipeline

### [KGM-042] Scene presets: lighting, background, post FX
- Labels: area/render, type/feature
- Priority: P3
- Effort: M
- Milestone: M5 Render backends
- Design doc: -

Three lighting presets (soft key, anime rim, flat), background color/image/
transparent, optional bloom and vignette. All addressable via query params
for OBS reproducibility.

Acceptance criteria:
- [ ] Presets switch live
- [ ] Full scene state serializable to a URL

### [KGM-043] Multi-avatar rooms (collab rendering)
- Labels: area/render, type/feature
- Priority: P2
- Effort: L
- Milestone: M5 Render backends
- Design doc: -

Multiple publishers in one room, one viewer renders them side by side.
Needs per-source identity in the transport layer (relay tags source id or
KGM2 adds a source field), per-source avatar assignment, and layout slots.

Acceptance criteria:
- [ ] Two trackers drive two avatars in one viewer
- [ ] Sources can be assigned different avatar files
- [ ] A source disconnecting fades its avatar out

### [KGM-044] Perfect Sync mapping editor
- Labels: area/render, type/feature
- Priority: P1
- Effort: L
- Milestone: M5 Render backends
- Design doc: docs/design/DD-008-calibration-retargeting.md

Many VRMs ship 52 ARKit-named expressions ("Perfect Sync"). Detect and use
them 1:1 when present. For others, provide a mapping editor: source channel
-> target expression with weight curves, save/load JSON per avatar,
share-friendly format.

Acceptance criteria:
- [ ] Perfect Sync models auto-detected and driven 1:1
- [ ] Editor edits mappings live with the avatar responding
- [ ] Mapping JSON round-trips

## M6 Product

### [KGM-045] Audio lipsync fused with visual tracking
- Labels: area/audio, type/feature
- Priority: P1
- Effort: XL
- Milestone: M6 Product
- Design doc: docs/design/DD-003-audio-lipsync.md

Microphone -> viseme estimation in an AudioWorklet, fused with the visual
jaw/mouth channels (audio leads during speech, vision leads for shapes).
Design doc covers formant-based vs small-ML approaches and the fusion rule.

Acceptance criteria:
- [ ] Speaking with a still face produces plausible mouth motion
- [ ] Latency audio->avatar < 80 ms
- [ ] Works offline (no cloud ASR)

### [KGM-046] Voice-activity expression accents
- Labels: area/audio, type/feature
- Priority: P3
- Effort: S
- Milestone: M6 Product
- Design doc: docs/design/DD-003-audio-lipsync.md

Use VAD energy to add subtle emphasis while talking: brow micro-raises,
head nod amplitude gain. Strictly bounded so it reads as life, not noise.

Acceptance criteria:
- [ ] Toggleable, default off
- [ ] No motion when silent

### [KGM-047] .kgm session recording and replay
- Labels: area/tooling, type/feature
- Priority: P1
- Effort: M
- Milestone: M6 Product
- Design doc: docs/design/DD-007-recording.md

Record the KGM frame stream to a file (header + timestamped frames),
replay it in the viewer, and use recordings as test fixtures for solver
and codec regression tests. This unlocks KGM-028's corpus requirement.

Acceptance criteria:
- [ ] Record/stop/download in tracker; drop-to-replay in viewer
- [ ] 10-minute session < 5 MB
- [ ] One recording committed as a test fixture

### [KGM-048] Motion clip export to VRMA
- Labels: area/tooling, type/feature
- Priority: P3
- Effort: L
- Milestone: M6 Product
- Design doc: docs/design/DD-007-recording.md

Convert .kgm recordings to VRM Animation (.vrma) clips so captured motion
can be reused in other VRM tools. Trim UI, loop marking.

Acceptance criteria:
- [ ] Exported .vrma plays in a third-party VRMA player
- [ ] Expressions and head bone both exported

### [KGM-049] Latency and quality HUD
- Labels: area/tooling, type/feature
- Priority: P2
- Effort: M
- Milestone: M6 Product
- Design doc: -

Viewer HUD: inbound fps, loss %, reorder count, estimated end-to-end
latency (probe frames echo tracker timestamps), transport mode. Tracker
HUD: inference time percentiles.

Acceptance criteria:
- [ ] Loss and latency numbers match a controlled netem test within 10%
- [ ] HUD hidden by `?hud=0`

### [KGM-050] Tauri desktop app with virtual camera output
- Labels: area/app, type/feature
- Priority: P2
- Effort: XL
- Milestone: M6 Product
- Design doc: -

Package tracker+viewer as a Tauri app. Key feature: output the rendered
avatar as an OS virtual camera so it works in Zoom/Meet/Discord, not just
OBS. Investigate per-OS virtual camera backends (Linux v4l2loopback,
Windows softcam, macOS CoreMediaIO extension).

Acceptance criteria:
- [ ] App runs tracker and viewer offline
- [ ] Virtual camera visible in one conferencing app per OS
- [ ] Binary < 25 MB (excluding models)

### [KGM-051] Phone-as-tracker mode
- Labels: area/app, type/feature
- Priority: P3
- Effort: L
- Milestone: M6 Product
- Design doc: -

Phones often have better cameras than laptops. QR pairing: PC viewer shows
a QR with room+token+relay URL, the phone opens the tracker page and
publishes. Requires HTTPS (KGM-012) and transport negotiation (KGM-036).

Acceptance criteria:
- [ ] QR pairing connects in < 10 s
- [ ] iOS Safari path documented (ws fallback)

### [KGM-052] Demo deployment on GitHub Pages
- Labels: area/docs, type/chore
- Priority: P1
- Effort: S
- Milestone: M6 Product
- Design doc: -

Deploy the static site (tracker+viewer, local mode) to GitHub Pages so
anyone can try Minamo with zero setup. Branch-based Pages publish from main.

Acceptance criteria:
- [ ] Public URL runs local-mode demo end to end
- [ ] README links it at the top

### [KGM-053] Contribution guide and issue templates
- Labels: area/docs, type/chore
- Priority: P2
- Effort: S
- Milestone: M6 Product
- Design doc: -

CONTRIBUTING.md (dev setup, code style, protocol-change policy),
.github issue templates (bug, feature, tracking-quality report with a
standard capture checklist), PR template.

Acceptance criteria:
- [ ] Templates render on GitHub
- [ ] Tracking-quality report template asks for camera, lighting, fps, browser
