<!-- i18n: language-switcher -->
[English](mediapipe-1.0-migration.md) | [日本語](mediapipe-1.0-migration.ja.md)

# MediaPipe tasks-vision 1.0 migration watchlist

`@mediapipe/tasks-vision` is publishing daily `1.0.0-rc.*` nightlies alongside
the last stable `0.10.35`. A 1.0 release with packaging/API changes is imminent,
and the tracker's core feature depends on Face Landmarker blendshapes plus the
facial transformation matrix. This page tracks what a 1.0 bump could break and
how we detect it early.

## How we are protected today

- **Exact pin.** `package.json` pins `@mediapipe/tasks-vision` to the exact
  version `0.10.35` (no caret), so a surprise `0.11`/`1.0` cannot auto-land.
- **Weekly canary.** `.github/workflows/mediapipe-canary.yml` installs
  `@mediapipe/tasks-vision@nightly` (the dist-tag carrying the `1.0.0-rc.*`
  builds) on a schedule and runs
  `scripts/mediapipe-canary-smoke.mjs`, which asserts the packaging surface the
  tracker relies on. A breaking change fails the canary and points back here —
  without touching the pinned build developers and CI use.

## Watchlist — what a 1.0 bump is likely to change

### 1. Entrypoints

- The tracker imports the ESM bundle via the package's `exports["."]` / `module`
  field (currently `vision_bundle.mjs`). 1.0 may rename or restructure the
  bundle or move to conditional/subpath exports.
- The four task classes the tracker constructs must remain exported:
  `FilesetResolver`, `FaceLandmarker`, `HandLandmarker`, `PoseLandmarker`.

### 2. WASM asset paths

- `scripts/fetch-models.sh` mirrors the SIMD and no-SIMD runtime pairs
  (`wasm/vision_wasm_internal.{js,wasm}`,
  `wasm/vision_wasm_nosimd_internal.{js,wasm}`) for local, CDN-free serving.
- 1.0 may rename these files, change the `wasm/` layout, or add/remove a
  module-threaded variant. If the filenames change, update both
  `scripts/fetch-models.sh` and the canary asset list.

### 3. Blendshape / result field names

- The tracker reads these result fields directly (`tracker/tracker.js`):
  `detectForVideo(...)`, `result.faceBlendshapes[i].categories[].categoryName`
  and `.score`, and `result.facialTransformationMatrixes`.
- Face Landmarker blendshapes are **not** deprecated in the 1.0 line, but a
  rename of any of these result fields would silently zero out expressions.
  The canary greps the shipped `vision.d.ts` for each name.

## Architecture note

Holistic Landmarker remains unpolished on the web, so keeping **separate**
Face / Hand / Pose tasks is still the right architecture through the 1.0
transition. Do not consolidate onto Holistic as part of a 1.0 bump.

## When the canary fails

1. Read the failing check names in the workflow log — they map 1:1 to the
   watchlist sections above.
2. Reproduce locally:
   `pnpm add -w @mediapipe/tasks-vision@nightly && node scripts/mediapipe-canary-smoke.mjs`.
3. Adjust the tracker adapter, `scripts/fetch-models.sh`, and the canary asset
   list as needed, then bump the exact pin in `package.json` (and regenerate the
   pinned model hashes — see `scripts/model-pins.sha256`).

## References

- https://www.npmjs.com/package/@mediapipe/tasks-vision
