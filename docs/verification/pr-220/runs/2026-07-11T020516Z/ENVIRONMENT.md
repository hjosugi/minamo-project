# Inochi2D runtime environment

- Date (UTC): `2026-07-11`
- OS: Linux x86_64, kernel `7.1.2-3-cachyos`
- Browser: Google Chrome `150.0.7871.114`, headless with WebGL2/SwiftShader
- Node.js: `v26.4.0`
- pnpm: `11.0.0`
- Rust toolchain used for the WASM build: `1.96.0`
- wasm-bindgen CLI: `0.2.126`
- Inox2D revision: `df8413e6b0c525dbb880b4dca2bdf0a5d4b9aaba`
- Network during runtime smoke: localhost static serving only

The production `dist/` output was served from localhost. Chrome loaded the
checked-in/generated WASM asset; it did not load renderer code from a CDN.

