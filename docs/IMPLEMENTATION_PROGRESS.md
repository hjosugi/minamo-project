# Implementation Progress Ledger

Date: 2026-07-05

Scope: progress against GitHub issues open at the start of the pass, covering
curated issues `#1`-`#53` and granular issues `#55`-`#196`.

Status: this is not a closure document. Issues stay open until their own
acceptance criteria are implemented and verified. This file records repository
evidence that can be used while completing the remaining work.

## Implementation Evidence

- Runtime/app: `shared/runtime.js`, `shared/codec.js`, `shared/transport.js`,
  `tracker/`, `viewer/`
- Relays: `relay-node/server.mjs`, `relay-rs/src/main.rs`
- Tests and gates: `tests/run-tests.mjs`, `scripts/lint.mjs`,
  `scripts/verify_structure.py`, `.github/workflows/ci.yml`
- Offline models: `scripts/fetch-models.sh`
- Self-hosting: `Dockerfile.relay-node`, `relay-rs/Dockerfile`,
  `docker-compose.yml`
- Product/docs/ops: `docs/DEV_HTTPS.md`, `docs/CONTRIBUTING.md`,
  `docs/ISSUE_LABELS.md`, `docs/DEPENDENCY_POLICY.md`,
  `docs/SECURITY_REVIEW.md`, `docs/RELEASE_CHECKLIST.md`,
  `docs/GLOSSARY.md`, `roadmap/index.html`

## Verification

Passed locally:

```sh
npm run lint
npm test
npm run verify
npm run build
cargo fmt --manifest-path relay-rs/Cargo.toml -- --check
cargo clippy --manifest-path relay-rs/Cargo.toml --all-targets -- -D warnings
cargo build --manifest-path relay-rs/Cargo.toml
cargo test --manifest-path crates/kgm1-codec/Cargo.toml
node --check relay-node/server.mjs
```

## Implemented Or Partially Implemented

- CI/lint/build/test gates exist for JavaScript, TypeScript, Rust relay, and
  the Rust KGM1 header codec.
- `decodeFrame` is non-throwing and covered by roundtrip, malformed, mutation,
  and 1M random-buffer tests.
- Runtime helpers now cover sequence ordering, dropped-frame detection, quality
  scoring, calibration profile normalization/application, mirror tests,
  synthetic frame generation, warning taxonomy, and semantic face controls.
- Tracker UI now has camera selection, resolution/FPS controls, settings
  persistence, privacy mode copy, quality warnings, calibration profile
  import/export, per-channel gain/deadzone/mute, smoothing presets/sliders,
  keyboard reset, and local JSONL recording.
- Viewer UI now persists connection settings, supports room tokens, has
  transparent OBS mode, and drops stale/out-of-order frames with wrap-aware
  sequence handling.
- WebSocket and WebTransport relays support optional room tokens. WebSocket
  also supports origin allowlisting and JSON fallback payloads.
- `relay-rs` rejects wrong room tokens with `403`, relays native
  WebTransport pub/sub datagrams under test, and removes empty rooms after the
  last participant leaves.
- A Tauri 2 desktop shell opens bundled tracker, viewer, and replay windows
  from the existing Vite app and reports per-OS virtual camera backend status.
- Offline MediaPipe vendoring, Docker Compose, HTTPS development, contribution,
  security, release, dependency, label, glossary, and roadmap docs exist.

## Still Open By Design

The remaining issue set includes large feature, research, app, and integration
work that is not complete merely because a design document exists. Examples:
Tauri virtual camera output, phone companion capture, full hand tracking,
full-body ONNX backend, Live2D/Inochi2D runtime integration, full drum
performance tracking, KGM2 production transport, MoQ/cluster relays, encryption,
asset compression pipelines, and manual benchmark/validation tasks.

Do not close those issues until their concrete acceptance criteria are met in
code, docs, tests, and any required manual verification.
