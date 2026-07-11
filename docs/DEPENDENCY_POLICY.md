<!-- i18n: language-switcher -->
[English](DEPENDENCY_POLICY.md) | [日本語](DEPENDENCY_POLICY.ja.md)

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

### TypeScript command runner

- `tsx` runs the local-only drum benchmark CLI directly from the TypeScript
  core so scoring logic is not duplicated. Its lockfile dependency `esbuild`
  is the only package allowed to run an install script through pnpm 11's
  `allowBuilds` map in `pnpm-workspace.yaml`; changes to that allow-list require
  supply-chain review.

### Inox2D browser renderer

- `third_party/inochi2d-wasm/Cargo.toml` pins both official Inox2D git crates
  to `df8413e6b0c525dbb880b4dca2bdf0a5d4b9aaba` (BSD-2-Clause).
- `viewer/vendor/inochi2d/minamo_inochi2d_bg.wasm` is generated with
  `wasm-bindgen 0.2.126`; SHA-256:
  `e5545620cc98944b71200d0205628abcc1f2cb3ce5873fa5cfc61c6876f95667`.
- The generated JS SHA-256 is
  `59922217e5db606c8d77916987909d63d24e0de3a0acb59e07fbbb3120edd2ce`.
  Runtime updates must rebuild both artifacts, update these hashes, preserve
  `LICENSE.inox2d`, and repeat the real browser smoke procedure.

## Rollback

- Keep each dependency update in its own commit unless it is inseparable from
  a code migration.
- If CI fails after an update, revert the dependency change first and reapply
  code changes only after the cause is known.
- Do not merge a dependency update that makes the no-server local demo depend
  on a network service.
