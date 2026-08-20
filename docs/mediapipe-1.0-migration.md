<!-- i18n: language-switcher -->
[English](mediapipe-1.0-migration.md) | [日本語](mediapipe-1.0-migration.ja.md)

# MediaPipe tasks-vision 1.0 migration watchlist

`@mediapipe/tasks-vision@1.0.1` is available, but Minamo must remain on the
exact `0.10.35` pin. PR #358 demonstrated that the 1.0 packaging and tracking
APIs are compatible while also exposing a new, blocking privacy change in the
published browser bundle.

## What 1.0.1 preserves

The 1.0.1 package still provides:

- the `vision_bundle.mjs` ESM entrypoint;
- the SIMD and no-SIMD WASM loader/binary pairs mirrored by
  `scripts/fetch-models.sh`;
- `FilesetResolver`, `FaceLandmarker`, `HandLandmarker`, and `PoseLandmarker`;
- `detectForVideo`, `faceBlendshapes`, and
  `facialTransformationMatrixes` with the signatures Minamo uses.

The package/API canary passes all of those checks. The main public type change
is the replacement of the old `InteractiveSegmenter` API with a new split-mode
API while renaming the old one to `InteractiveSegmenterLegacy`; Minamo does not
use either API.

## Why 1.0.1 is blocked

The 1.0.1 ESM/CJS browser bundles create a metrics logger for each task and can
POST protobuf performance/utilization events to:

```text
https://odml.pa.googleapis.com/v1/log
```

The bundle includes an embedded API-key bridge and the `x-goog-api-key` sender
header. The corresponding 0.10.35 bundle has no ODML sender. MediaPipe's
official privacy notice says input images remain on-device, but performance and
utilization metrics are sent to Google and the application developer is
responsible for any required informed consent. An upstream maintainer also
confirmed that no opt-out is planned, although blocking the destination host is
supported.

That behavior conflicts with Minamo's default “Local-only privacy” and “only
tracking values are sent” contract. It is not detected by the first-party
raw-frame data-flow check because the sender lives in an installed dependency.
Passing builds, types, unit tests, and the old package/API canary therefore was
not enough to approve PR #358.

## Automated guardrails

- `package.json` stays exactly pinned to `0.10.35`.
- `pnpm check:mediapipe` resolves the installed package, checks the required
  entrypoints/WASM/API surface, then scans every root browser bundle for known
  ODML endpoint/sender markers.
- Normal pull-request CI and `scripts/release-smoke.mjs` run that command.
  `scripts/verify_structure.py` also verifies the command remains wired and
  that the blocked markers remain present in the guard.
- The weekly nightly canary uses the same guard, so privacy regressions are
  reported before a version bump is proposed.

Do not delete, rename, or weaken a privacy marker to make a dependency update
green. A change to Minamo's telemetry policy requires its own product/privacy
decision and user-consent design.

## Acceptance checklist for a future upgrade

1. Obtain an upstream browser artifact with no automatic third-party metrics
   sender. `pnpm check:mediapipe` must pass unchanged.
2. Run the tracker with locally vendored bundle, WASM, and models while
   capturing browser and packaged-desktop traffic. Starting, using, and
   stopping Face / Hand / Pose tasks must cause no undeclared external request.
3. Repeat camera inference in a real browser for face blendshapes, facial
   matrices, pose, hands, CPU/no-SIMD fallback, and GPU/SIMD mode.
4. Update the exact version together in `package.json`, `pnpm-lock.yaml`,
   `tracker/tracker.js`, `scripts/fetch-models.sh`, and
   `types/browser-js.d.ts`; update the CDN bundle SRI and regenerate
   `scripts/model-pins.sha256`.
5. Run `pnpm check:mediapipe`, `pnpm test`, `pnpm verify`,
   `pnpm typecheck:js`, `pnpm build`, and the full release smoke.

## Architecture note

Keep separate Face / Hand / Pose tasks. Do not combine the 1.0 dependency
review with a migration to Holistic Landmarker.

## References

- [MediaPipe v1.0.0 release notes](https://github.com/google-ai-edge/mediapipe/releases/tag/v1.0.0)
- [MediaPipe privacy notice](https://github.com/google-ai-edge/mediapipe#privacy-notice)
- [Upstream Web telemetry clarification](https://github.com/google-ai-edge/mediapipe/issues/6306#issuecomment-4673728357)
- [@mediapipe/tasks-vision package](https://www.npmjs.com/package/@mediapipe/tasks-vision)
