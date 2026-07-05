# Release Checklist

- `npm run lint`
- `npm test`
- `npm run verify`
- `npm run build`
- `cargo fmt --manifest-path relay-rs/Cargo.toml -- --check`
- `cargo clippy --manifest-path relay-rs/Cargo.toml --all-targets -- -D warnings`
- `cargo build --manifest-path relay-rs/Cargo.toml --release`
- `cargo test --manifest-path crates/kgm1-codec/Cargo.toml`
- Confirm local mode tracker -> viewer works.
- Confirm WebSocket relay works with and without `KAGAMI_RELAY_TOKEN`.
- Confirm WebTransport relay starts and prints a certificate hash.
- Review [SECURITY_REVIEW.md](SECURITY_REVIEW.md).
- Update roadmap, docs index, and issue closure notes.
