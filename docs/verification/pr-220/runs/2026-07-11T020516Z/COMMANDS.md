# Inochi2D runtime commands

## Repository checks

```sh
pnpm lint
pnpm test
pnpm typecheck:js
pnpm verify
pnpm build
pnpm release:smoke

cargo fmt --manifest-path third_party/inochi2d-wasm/Cargo.toml -- --check
cargo clippy --manifest-path third_party/inochi2d-wasm/Cargo.toml \
  --target wasm32-unknown-unknown -- -D warnings
```

The WASM target build used the pinned Rust 1.96 toolchain and a package-local
`CARGO_TARGET_DIR`. The browser artifact was generated with:

```sh
wasm-bindgen --target web \
  --out-dir viewer/vendor/inochi2d \
  --out-name minamo_inochi2d \
  third_party/inochi2d-wasm/target/wasm32-unknown-unknown/release/minamo_inochi2d_wasm.wasm
```

## Browser smoke

1. Download the public Aka model at Inochi2D/example-models commit
   `cd95dd00ddff63b1f7d2b84a19914c3c70d05945` and verify its Git LFS SHA-256
   `dbf82ffb86d1c761bca883ad37ec1c47487a447f8104290b459ce60aaee81e0f`.
2. Keep Aka's original 1,593,026-byte puppet JSON, all 34 parameters, nodes,
   meshes, bindings, and 76 texture slots. For this runtime-only smoke, replace
   each texture payload with the model's smallest original valid TGA. The local
   derived input is 1,686,758 bytes with SHA-256
   `bd7feb293aa01c407c1deb86550145966b5c1969081bfab7fc6fc6693ce91ba9`.
3. Serve the production `dist/` and the derived input from one localhost
   origin. Open `viewer/?inochi=/Aka-smoke2.inx` in Chrome with WebGL2 enabled.
4. Enable Chrome DevTools Protocol `Runtime.exceptionThrown`, reload, allow the
   render loop to run for seven seconds, and evaluate the Viewer status fields.
5. Confirm no exception event, status `open`, a hidden Inochi2D render canvas,
   and mapping status `Inochi2D 4/34 parameters`.

The downloaded and derived puppets remained outside the repository and were
deleted from the publish scope. The texture substitution makes this a renderer
lifecycle smoke, not the visual-quality evidence required by #230.

