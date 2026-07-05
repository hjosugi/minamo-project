# Release Checklist

## Preflight

- Working tree is clean before release changes begin.
- `README.md`, `README.ja.md`, `docs/INDEX.md`, and `docs/ROADMAP.md` match
  the release scope.
- Open issues that are closed by the release have verification notes.
- `SECURITY_REVIEW.md` has been checked for transport, token, media, or model
  changes.

## Automated Checks

```sh
npm run lint
npm test
npm run verify
npm run build
cargo fmt --manifest-path relay-rs/Cargo.toml -- --check
cargo clippy --manifest-path relay-rs/Cargo.toml --all-targets -- -D warnings
cargo build --manifest-path relay-rs/Cargo.toml --release
cargo test --manifest-path crates/kgm1-codec/Cargo.toml
cd relay-node && node --check server.mjs
```

## Manual Smoke Tests

- Local mode: tracker -> viewer works through BroadcastChannel.
- WebSocket relay works without `MINAMO_RELAY_TOKEN`.
- WebSocket relay rejects missing or wrong tokens when
  `MINAMO_RELAY_TOKEN` is set.
- WebTransport relay starts and prints a certificate hash.
- Viewer drops stale/out-of-order frames without freezing.
- Tracker can start, stop, reset calibration, and keep settings local.

## Artifact Review

- Generated files are expected and intentional.
- No recordings, local model downloads, secrets, or temporary captures are
  committed.
- Release notes mention known browser, HTTPS, WebTransport, and model fallback
  caveats.
- Tag or deployment target points at the commit whose CI completed
  successfully.
