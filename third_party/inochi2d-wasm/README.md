# Minamo Inochi2D WASM boundary

This crate is Minamo's thin browser boundary around the official
[`Inox2D`](https://github.com/Inochi2D/inox2d) renderer. Both upstream git
dependencies are pinned to commit
`df8413e6b0c525dbb880b4dca2bdf0a5d4b9aaba` (2026-03-14).

Build the checked-in browser artifact with:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.126 --locked
CARGO_TARGET_DIR=third_party/inochi2d-wasm/target \
  cargo build --manifest-path third_party/inochi2d-wasm/Cargo.toml \
  --target wasm32-unknown-unknown --release
wasm-bindgen \
  --target web \
  --out-dir viewer/vendor/inochi2d \
  --out-name minamo_inochi2d \
  third_party/inochi2d-wasm/target/wasm32-unknown-unknown/release/minamo_inochi2d_wasm.wasm
```

Use Rust 1.96 and the exact `wasm-bindgen` version selected in `Cargo.lock`. The generated JS
and WASM are committed so the Viewer and Tauri build never fetch runtime code.

Inox2D is experimental upstream. Current known unsupported input is BC7 puppet
textures; the Viewer reports that limitation explicitly instead of falling back
silently.
