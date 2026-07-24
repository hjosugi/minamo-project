<!-- i18n: language-switcher -->
[English](2026-07-code-and-research-audit.md) | [日本語](2026-07-code-and-research-audit.ja.md)

# Research: July 2026 Code and Research Audit

Status: completed audit pass. Every actionable finding is registered as a
GitHub issue (#246-#278); this document is the durable index and the
research-landscape summary behind those issues.

## Method

Three code/document analysis passes (TypeScript/JavaScript runtime, Rust /
backend / CI, docs-vs-code drift) and two literature/ecosystem passes
(tracking research 2024-2026, transport/runtime ecosystem 2026) were run
against commit `4676f1d` (v0.1.8). High-severity findings were re-verified
line by line against the working tree before an issue was filed. Existing
open issues (#23-#241) were checked to avoid duplicates.

## Registered issues

### Security and correctness (P0/P1)

- #246 relay-rs: unbounded rooms/sessions, no rate limits (DoS)
- #247 relay-node: Origin bypass, no payload cap, no backpressure, token-store growth
- #248 e2ee.js: AES-GCM nonce construction (shared 64-bit random space)
- #249 shared/filters.js OneEuroFilter: no finite-sample guard (P0)
- #250 Tauri capability file omits tracker/replay windows
- #251 Tauri hardening: CSP, withGlobalTauri, innerHTML sink, signed updater
- #252 KGM2: delta quantizer clamp corruption, decoder keyframe-map growth
- #253 tracker camera startup can hang forever
- #254 drum.ts velocity/axis convention mismatch

### Architecture and technical debt

- #255 orphaned `src/` next-gen pipeline: integrate or archive
- #256 three incompatible formats all named "KGM1"; version gating
- #258 Erlang router dead code; JS "load test" gives false coverage
- #259 per-frame allocations in tracker/replay hot paths

### CI, tests, supply chain

- #257 executable cross-language KGM1B conformance
- #260 dependency/vulnerability scanning; pinned model hashes
- #261 CI builds what we ship (Tauri bundle, Docker, clippy, --locked)
- #262 fuzz/property tests for network-facing binary parsers
- #263 tracker.js/viewer.js zero test coverage
- #264 enforce automatable quality gates in CI

### Docs and product

- #265 license contradiction (0BSD vs stray MIT)
- #266 BACKLOG checkbox reconciliation; stale ledgers
- #267 runtime EN/JA string localization

### Research adoption (2024-2026 literature)

- #268 audio-to-ARKit lipsync models (wav2arkit_cpu, LAM_Audio2Expression, Audio2Face-3D)
- #269 RTMW/RTMW3D whole-body model for the ONNX backend
- #270 learned smoothing filters (FLK, HPSTM) vs One Euro
- #271 hands: WiLoR detector, ReJSHand
- #272 MediaPipe tasks-vision 1.0.0-rc canary
- #273 face quality mode (SMIRK-class) and MobileGaze gaze
- #274 2026 transport strategy: WebTransport Baseline, MoQ secure-objects
- #275 Inochi2D strategy after the nijigenerate/nijilive fork
- #276 three.js WebGPURenderer + MToonNodeMaterial migration
- #277 KGM2 bitrate: quantized-delta + entropy coding vs neural tokenizers
- #278 MIDI-driven avatar drumming and fast-motion techniques

## Research landscape highlights (mid-2026)

- Lipsync: single-file ONNX audio-to-52-blendshape models now exist
  (wav2arkit_cpu; LAM_Audio2Expression); NVIDIA open-sourced Audio2Face-3D
  in September 2025.
- Full body: RTMW/RTMW3D (Apache-2.0, official ONNX export) covers body,
  hands, and face with 133 keypoints in one model.
- Smoothing: FLK (learned-kinematics Kalman) is the most practical One Euro
  successor; HPSTM adds anatomically-constrained transformer smoothing.
- Hands: WiLoR's lightweight detector beats BlazePalm under occlusion;
  ReJSHand delivers 72 fps edge MANO meshes.
- Face: MediaPipe's blendshape model is unchanged since 2023; SMIRK-class
  capture is the plausible quality upgrade, gated by the FLAME license.
- Transport: WebTransport reached Baseline in March 2026 (Safari 26.4);
  MoQ transport is at draft -17/-18 with production relays but remains
  pre-RFC; draft-ietf-moq-secure-objects is the E2EE reference.
- Runtime: onnxruntime-web WebGPU EP is production-grade; WebNN is still in
  origin trial; MediaPipe tasks-vision publishes 1.0.0-rc nightlies.
- Rendering: three.js WebGPURenderer is production-recommended; three-vrm
  3.5.x supports it via MToonNodeMaterial; the Inochi2D community forked
  into nijigenerate/nijilive.
- Compression: meshoptimizer hit v1.0; KHR_meshopt_compression exists but
  lacks loader support, so EXT_meshopt_compression stays the default.

## Verified-safe notes

Checked and found already current at audit time: quinn-proto 0.11.16
(RUSTSEC-2026-0037 fixed), ws 8.21.0 (CVE-2026-45736/48779 fixed),
wtransport 0.7.1, tauri-plugin-shell not a dependency. #260 exists so this
stays true automatically rather than by luck.
