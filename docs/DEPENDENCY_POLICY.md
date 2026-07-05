# Dependency Update Policy

KAGAMI is local-first tracking software, so dependency changes must preserve
privacy, latency, and reproducibility.

## Policy

- Pin model, runtime, and tool versions in scripts or manifests.
- Avoid CDN-only functionality. Provide a local vendoring or fallback path.
- Keep camera/video/audio dependencies local-first unless a feature explicitly
  asks the user to transmit media.
- Prefer small dependency updates that can be reviewed and reverted
  independently.
- Treat inference, renderer, transport, crypto, and build-system dependencies
  as high-risk changes.

## Update Flow

JavaScript dependencies:

```sh
npm install
npm run lint
npm test
npm run verify
npm run build
```

Rust dependencies:

```sh
cargo update
cargo fmt --manifest-path relay-rs/Cargo.toml -- --check
cargo clippy --manifest-path relay-rs/Cargo.toml --all-targets -- -D warnings
cargo build --manifest-path relay-rs/Cargo.toml --release
cargo test --manifest-path crates/kgm1-codec/Cargo.toml
```

Relay-node dependencies:

```sh
cd relay-node
npm install
node --check server.mjs
```

## Risk Notes

- MediaPipe, ONNX, model, compression, or rendering changes must include notes
  for startup time, inference time, bundle size, and privacy impact.
- WebSocket/WebTransport, TLS, token, or origin-check changes must link to
  `SECURITY_REVIEW.md`.
- Model or WASM asset updates must record source URL, version, license, and
  checksum/SRI where practical.
- If a dependency changes browser support, update `QUICKSTART.md` or
  `DEV_HTTPS.md`.

## Rollback

- Keep each dependency update in its own commit unless it is inseparable from
  a code migration.
- If CI fails after an update, revert the dependency change first and reapply
  code changes only after the cause is known.
- Do not merge a dependency update that makes the no-server local demo depend
  on a network service.
