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
