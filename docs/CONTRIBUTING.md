<!-- i18n: language-switcher -->
[English](CONTRIBUTING.md) | [日本語](CONTRIBUTING.ja.md)

# Contribution Guide

Use the issue templates for new bugs and feature requests. For tracking issues,
include the capture mode, browser, camera, lighting conditions, relay mode, and
whether a VRM model was loaded.

Before opening a pull request:

- Run `pnpm lint`, `pnpm test`, `pnpm verify`, and `pnpm build`.
- If relay code changed, run `cargo fmt`, `cargo clippy`, and `cargo build`
  under `relay-rs/`.
- Keep camera/video data local. Do not attach private face recordings unless
  they are synthetic or explicitly approved.
- Link the issue number and list the acceptance criteria covered by the change.

Labels follow the taxonomy in [ISSUE_LABELS.md](ISSUE_LABELS.md).

## Fuzzing the KGM1B container decoder

`crates/kgm1-codec` parses untrusted network input, so it has a cargo-fuzz
harness under `crates/kgm1-codec/fuzz`. CI gives each target 30 seconds on every
push; `.github/workflows/fuzz.yml` runs ten minutes per target weekly against a
corpus cached between runs. To run it locally you need a nightly toolchain:

```
rustup toolchain install nightly
cargo install cargo-fuzz
node scripts/seed-fuzz-corpus.mjs
cargo +nightly fuzz run --fuzz-dir crates/kgm1-codec/fuzz decode_packet
```

The targets are `decode_packet` (arbitrary bytes), `corrupt_valid` (valid packets
the fuzzer then damages, so mutations land past the magic and version gate) and
`roundtrip` (exhaustive truncation and version-gate invariants).

A fuzz target that cannot fail is indistinguishable from one that never fails,
so when changing the harness, verify it by planting a bug in the decoder and
confirming the target catches it. The contract in `fuzz/src/lib.rs` asserts in
both directions on purpose — accepted bytes must re-encode to exactly the input,
and rejected bytes must be genuinely invalid — because "never panics" is also
satisfied by a decoder that rejects everything.
