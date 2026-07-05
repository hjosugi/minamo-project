# Dependency Update Policy

KAGAMI is local-first tracking software, so dependency changes must preserve
privacy, latency, and reproducibility.

- Pin model/tool versions in scripts or manifests.
- Update JavaScript dependencies with `npm install`, then run the full CI suite.
- Update Rust dependencies with `cargo update`, then run `cargo fmt`, `clippy`,
  `build`, and relevant relay smoke tests.
- For MediaPipe, ONNX, model, compression, or rendering dependency changes,
  include benchmark notes for startup time, inference time, bundle size, and
  privacy impact.
- Avoid CDN-only functionality. Provide a local vendoring or fallback path.
