# Dependency Update Policy

Minamo is local-first tracking software, so dependency changes must preserve
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
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm verify
pnpm build
```

`pnpm verify` checks that the MediaPipe Tasks Vision version is consistent
between `package.json`, `tracker/tracker.js`, and `scripts/fetch-models.sh`.
It also rejects MediaPipe model URLs that do not include a pinned model version
segment.

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
pnpm install --frozen-lockfile
cd relay-node
node --check server.mjs
pnpm test
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

### Pinned QR renderer

- `qrcode` `1.5.4` (MIT, <https://github.com/soldair/node-qrcode>) renders the
  #226 pairing payload locally. The Vite desktop plus QR chunks are about 35 kB
  before gzip with the pairing UI included.
- The directly served relay page falls back to a same-relay, `no-store` SVG
  renderer. Neither path calls a third-party QR service or uploads camera
  media; the relay does not log QR payloads or room tokens.

## Rollback

- Keep each dependency update in its own commit unless it is inseparable from
  a code migration.
- If CI fails after an update, revert the dependency change first and reapply
  code changes only after the cause is known.
- Do not merge a dependency update that makes the no-server local demo depend
  on a network service.
