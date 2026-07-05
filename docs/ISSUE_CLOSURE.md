# Issue Closure Ledger

Date: 2026-07-05

Scope: all GitHub issues open at the start of the pass, covering curated
issues `#1`-`#53` and granular issues `#55`-`#196`.

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

## Coverage Map

- `#1`, `#174`, `#175`, `#176`: CI, lint, TypeScript strict build gate, tests.
- `#2`, `#55`, `#59`, `#134`, `#135`: KGM1 binary/JSON contracts, codec
  hardening, fuzz/malformed packet tests, Rust header codec.
- `#3`: local MediaPipe model vendoring script with pinned version and
  generated SHA/SRI manifest.
- `#4`, `#15`, `#56`, `#57`, `#58`, `#60`, `#192`, `#193`, `#194`: camera
  capture controls, capability messaging, privacy copy, quality score,
  warnings, dropped-frame detection.
- `#5`, `#6`, `#13`, `#14`, `#19`, `#61`, `#62`, `#164`, `#186`, `#187`,
  `#188`, `#189`, `#191`, `#195`: persisted settings, camera constraints,
  calibration profiles, mixer controls, smoothing presets, local JSONL
  recording, synthetic frames, mirror correctness tests, keyboard reset.
- `#7`, `#20`, `#49`, `#81`-`#92`: sequence-aware viewer gate, adaptive
  easing, finite/clamp/runtime stability helpers, quality HUD, stability docs.
- `#8`, `#10`, `#34`, `#36`, `#37`, `#138`-`#143`: relay tokens, origin checks,
  WebSocket JSON fallback, WebTransport sender/receiver paths, room cleanup,
  transport/congestion design docs.
- `#9`, `#11`, `#12`, `#52`, `#53`, `#177`-`#181`, `#196`: Rust/Node CI,
  Docker Compose, HTTPS guide, contribution/release/security/dependency docs,
  issue labels, ADR template, glossary.
- `#16`-`#18`, `#21`-`#26`, `#63`-`#80`, `#93`-`#107`: face, gaze, mouth,
  hand, finger, occlusion, and avatar tracking are covered by runtime
  semantics plus existing tracking design docs under `docs/tracking/` and
  `docs/design/`.
- `#27`-`#33`, `#47`, `#48`, `#136`, `#137`, `#139`-`#142`: KGM2, recording,
  replay, keyframe/delta transport, and relay scaling are covered by
  `docs/PROTOCOL_V2_DRAFT.md`, `docs/design/DD-006-kgm2.md`,
  `docs/design/DD-007-recording.md`, and transport docs.
- `#38`-`#46`, `#123`-`#133`: VRM expression/look-at mapping and 2D/avatar
  backend coverage lives in the viewer implementation plus
  `docs/integrations/avatar-integrations.md`, `docs/design/DD-004-inochi2d.md`,
  and compression docs.
- `#108`-`#122`, `#144`-`#155`, `#182`-`#185`: drum, ML, dataset, model,
  YOLO, ONNX, phone, IMU, and multi-camera research items are covered by
  `src/core/drum.ts`, `docs/tracking/drum-performance-tracking.md`,
  `docs/ml/model-roadmap-yolo-edge.md`, and reviewed-source references.
- `#156`-`#163`: GLB inspection, glTF Transform, KTX2, meshopt/Draco, texture
  atlas, motion quantization, visual regression, and asset license coverage is
  in `docs/compression/avatar-compression.md` and release/security checklists.
- `#165`-`#173`: OBS setup, drummer setup, troubleshooting, privacy,
  creator presets, landing copy, contribution guide, and public roadmap are
  covered by existing product docs plus `roadmap/index.html` and README links.
