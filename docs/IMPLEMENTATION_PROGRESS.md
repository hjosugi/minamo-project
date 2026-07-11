# Implementation Progress Ledger

Date: 2026-07-05

Scope: progress against GitHub issues open at the start of the pass, covering
curated issues `#1`-`#53` and granular issues `#55`-`#196`.

Status: this is not a closure document. Issues stay open until their own
acceptance criteria are implemented and verified. This file records repository
evidence that can be used while completing the remaining work.

## 2026-07-08 pass (v0.1.4)

Closed with verifiable deliverables (docs + code + tests, all gates green):

- Compression docs #156-#163: eight focused per-stage guides under
  `docs/compression/`, plus `shared/compression-checklist.js`
  (`evaluateAssetChecklist` sample-asset gate) and `shared/motion-quant.js`
  (motion delta quantization reference codec) with round-trip and
  rig-preservation tests.
- Drum #118-#123: hi-hat/kick pedal inference design docs, OBS drum overlay
  (`shared/drum-overlay.js` + `viewer/drum-overlay.html`), benchmark clips
  fixture (`tests/fixtures/drum-benchmark-clips.json`) with a fast-roll stress
  test, and the YOLO stick/drum training schema (`docs/ml/drum-dataset-schema.md`
  + `docs/product/drum-dataset.schema.json`).
- Research #183-#185: multi-camera fusion, phone camera companion, and IMU stick
  evaluations under `docs/research/`.

Advanced but kept open (remaining criteria need hardware/manual verification):

- #23 full-body ONNX: runtime-toggleable backend registry
  (`createPoseBackendRegistry`/`setActiveBackend` in `src/core/ml.ts`), DD-009,
  and the fps/VRAM benchmark table. Open until an ONNX model is integrated and
  benchmarked on a real WebGPU device.
- #41 asset pipeline: `kagami-pack` planner CLI (`pnpm pack:avatar`) with the
  before/after size table. Open until the packed VRM is verified identical in the
  viewer with a real gltfpack/gltf-transform toolchain.
- #43 multi-avatar rooms: `assignRoomLayoutSlots` deterministic layout + fade-out.
  Open until two live trackers are verified in one viewer.
- #51 phone-as-tracker: `shared/pairing.js` URL contract, desktop QR/copy UI,
  relay-issued short-lived tokens, query application, and iOS Safari ws
  fallback are implemented under #226. Open until secure negotiation (#227)
  and real-phone timing (#228) are verified.
- #38 Inochi2D and #50 Tauri virtual camera stay open per their existing design
  docs; both need runtime/hardware verification (KGM-050 is held open by the
  structure check by design).

## Implementation Evidence

- Runtime/app: `shared/runtime.js`, `shared/codec.js`, `shared/kgm1b.js`,
  `shared/kgm2.js`, `shared/transport.js`, `tracker/`, `viewer/`
- Relays: `relay-node/server.mjs`, `relay-rs/src/main.rs`
- Tests and gates: `tests/run-tests.mjs`, `scripts/lint.mjs`,
  `scripts/verify_structure.py`, `.github/workflows/ci.yml`
- Offline models and reference codecs: `scripts/fetch-models.sh`,
  `scripts/kgm1b_codec.py`, `crates/kgm1-codec`,
  `packages/kgm1-codec-py`
- Self-hosting: `Dockerfile.relay-node`, `relay-rs/Dockerfile`,
  `docker-compose.yml`
- Product/docs/ops: `docs/DEV_HTTPS.md`, `docs/CONTRIBUTING.md`,
  `docs/ISSUE_LABELS.md`, `docs/DEPENDENCY_POLICY.md`,
  `docs/SECURITY_REVIEW.md`, `docs/RELEASE_CHECKLIST.md`,
  `docs/GLOSSARY.md`, `roadmap/index.html`

## Verification

Passed locally:

```sh
pnpm lint
pnpm test
pnpm verify
pnpm build
cargo fmt --manifest-path relay-rs/Cargo.toml -- --check
cargo clippy --manifest-path relay-rs/Cargo.toml --all-targets -- -D warnings
cargo build --manifest-path relay-rs/Cargo.toml
cargo test --manifest-path crates/kgm1-codec/Cargo.toml
python3 scripts/kgm1b_codec.py decode-packet <kgm1b-golden-hex>
node --check relay-node/server.mjs
```

## Implemented Or Partially Implemented

- CI/lint/build/test gates exist for JavaScript, TypeScript, Rust relay, and
  the Rust KGM1 header codec.
- `decodeFrame` is non-throwing and covered by roundtrip, malformed, mutation,
  and 1M random-buffer tests.
- Runtime helpers now cover sequence ordering, dropped-frame detection, quality
  scoring, calibration profile normalization/application, mirror tests,
  synthetic frame generation, warning taxonomy, iris-gaze calibration/fallback,
  blink/wink hysteresis, and semantic face controls.
- Tracker UI now has camera selection, resolution/FPS controls, settings
  persistence, privacy mode copy, quality warnings, a 30-second guided
  calibration flow, calibration profile import/export, per-channel
  gain/deadzone/mute, configurable head-distance lean stabilization, smoothing
  presets/sliders with lag/jitter readouts, tracking-loss fade/re-entry easing,
  sticky multi-face selection with persisted face lock, keyboard reset, and
  local JSONL recording. Hands now run on a capped 30 Hz schedule, use a
  16-byte hand target, expose hand calibration and per-finger debug graphs,
  classify point/peace/drum-grip/finger-count gestures, and hold only short
  occlusions before omitting the hand block.
- Viewer UI now persists connection settings, supports room tokens, has
  transparent OBS mode, drops stale/out-of-order frames with wrap-aware
  sequence handling, maps VRM fingers with natural coupling curves, and has an
  arm-solver toggle that falls back to sway-only mode.
- WebSocket and WebTransport relays support optional room tokens. WebSocket
  also supports origin allowlisting and JSON fallback payloads.
- `relay-rs` rejects wrong room tokens with `403`, relays native
  WebTransport pub/sub datagrams under test, and removes empty rooms after the
  last participant leaves.
- KGM2 compact face frames now have a JS reference encoder/decoder with
  smallest-three quaternion packing, keyframe/delta recovery, sparse channel
  masks, and clock-offset estimation helpers. KGM1B packet framing has JS,
  Rust, and Python reference implementations with JS-generated golden-vector
  tests.
- Hand stability has a synthetic golden clip fixture, a shipped
  no-broken-finger diagnostic page, a benchmark report, and verifier checks
  covering jump clamps, short recovery holds, and long occlusion omission.
- A Tauri 2 desktop shell opens bundled tracker, viewer, and replay windows
  from the existing Vite app and reports per-OS virtual camera backend status.
- The Viewer has an experimental, offline Inochi2D backend for `.inp/.inx`:
  official Inox2D source is revision-pinned and compiled to checked-in WASM,
  named parameters share the live/exportable expression mapping editor, and a
  hidden WebGL2 target is composited through the final Three.js scene.
- Offline MediaPipe vendoring, Docker Compose, HTTPS development, contribution,
  security, release, dependency, label, glossary, and roadmap docs exist.

## Still Open By Design

The remaining issue set includes large feature, research, app, and integration
work that is not complete merely because a design document exists. Examples:
Tauri virtual camera output, phone companion capture, full-body ONNX backend,
Live2D runtime integration, real-puppet Inochi2D validation, full drum
performance tracking, KGM2 production transport, MoQ/cluster relays, encryption,
asset compression pipelines, and manual benchmark/validation tasks.

Do not close those issues until their concrete acceptance criteria are met in
code, docs, tests, and any required manual verification.
