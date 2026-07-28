<!-- i18n: language-switcher -->
[English](RELEASE_CHECKLIST.md) | [日本語](RELEASE_CHECKLIST.ja.md)

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
pnpm lint
pnpm test
pnpm verify
pnpm typecheck:js
pnpm build
pnpm release:smoke
cargo fmt --manifest-path relay-rs/Cargo.toml -- --check
cargo clippy --manifest-path relay-rs/Cargo.toml --all-targets -- -D warnings
cargo build --manifest-path relay-rs/Cargo.toml --release
cargo test --manifest-path crates/kgm1-codec/Cargo.toml
cd relay-node && node --check server.mjs
```

`pnpm release:smoke` first validates `pnpm-lock.yaml` with a frozen install, then
runs the automated release checks above where the
required toolchains are available. It does not replace the manual browser,
camera, relay-token, WebTransport, or OBS smoke tests.

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
- The GitHub Release stays in draft until Linux, Windows, Apple Silicon macOS,
  and Intel macOS installer jobs all succeed.
- Release assets include Linux `.AppImage`/`.deb`, Windows `.exe`/`.msi`, and
  both `aarch64` and `x86_64` macOS `.dmg` files.
- Each native installer filename includes the version, platform, and
  architecture; its version matches the tag.
- Release notes mention known browser, HTTPS, WebTransport, and model fallback
  caveats.
- Release notes and desktop docs disclose the current code-signing status.
- Tag or deployment target points at the commit whose CI completed
  successfully.
