<!-- i18n: language-switcher -->
[English](quality-gates.md) | [日本語](quality-gates.ja.md)

# Quality Gates

## P0 gates

- no NaN/Infinity reaches renderer
- no impossible finger pose reaches renderer without clamp warning
- no mouth flicker above threshold during closed-mouth neutral test
- no blink flicker above threshold during open-eye test
- no drum hit emitted from one visual frame only
- no raw webcam upload in default mode

## P1 gates

- 60fps target on modern laptop for face + hands
- 30fps fallback on low-end laptop
- stable hand reacquisition after 500ms occlusion
- hit timing error under target threshold for simple snare hits
- avatar mapping test for VRM and one 2D format

## P2 gates

- WebTransport motion streaming under target latency
- mobile browser smoke test
- low-light quality warning
- custom stick detector benchmark

## Runtime Quality Score

The tracker computes a per-frame score from normalized sub-scores:

| Input | Weight | Good fixture expectation |
| --- | ---: | --- |
| mean luma | 0.22 | normal indoor lighting is never `poor` |
| landmark confidence | 0.28 | full face visible stays `good` |
| observed fps | 0.18 | 30-60 fps remains usable |
| inference time | 0.14 | short spikes degrade but recover |
| rolling dropped frames | 0.10 | startup stalls do not poison later frames |
| motion blur estimate | 0.08 | fast motion can warn independently |

Fixtures should cover good indoor lighting, low light, dropped fps, high
inference time, occlusion, and motion blur. Quality regressions should fail in
unit tests before they reach manual camera testing.

## What CI enforces, and what it cannot

The gates above describe the target. This section records which of them a
machine actually checks today, so the split is explicit rather than assumed
(#264).

### Enforced automatically

| Gate | Where |
| --- | --- |
| Finite/NaN guards, finger clamps, anatomy constraints | `tests/run-tests.mjs`, vitest |
| Mouth-flicker and blink scores, quality-score formula | `tests/run-tests.mjs` |
| Codec robustness: 1M random buffers, every single-bit flip, truncation at every offset | `tests/run-tests.mjs` (#262) |
| KGM1B container: version gating and cross-language conformance | `tests/run-tests.mjs`, `cargo test`, `python -m kgm1_codec verify-vectors` (#256, #257) |
| Sequence handling: out-of-order rejection and 65535 wrap | `tests/run-tests.mjs` |
| Latency/loss HUD arithmetic against a controlled netem profile | `shared/hud-metrics.js` + `tests/run-tests.mjs` |
| Audio lipsync within its latency budget | `tests/run-tests.mjs` |
| **No raw webcam upload** | `scripts/check-privacy-invariants.mjs` |
| Coverage floors for the shipped runtime | `scripts/check-coverage.mjs` (#263) |
| Every page entry module loads and binds its controls | `tests/run-tests.mjs` DOM-stub smoke tests |

### Not enforced, and why

| Gate | Why a machine cannot decide it here |
| --- | --- |
| 60/30 fps performance targets | Wall-clock on a shared CI runner. Note the trap found in #316: under V8 coverage instrumentation the same code measures ~2.7x slower, so any timing gate must know whether it is running instrumented. |
| Hand reacquisition within 500 ms | Needs real camera input; the synthetic clips do not model occlusion recovery timing. |
| Drum hit-timing threshold | `pnpm benchmark:drum` needs consented recordings that are not in the repository. |
| WebTransport latency target | Needs a real relay and network path. |
| Mobile smoke | Needs a device. |
| VRM + 2D visual mapping | Needs a human looking at the render; only the mapper's unit behaviour is checked. |
| OBS transparency, virtual camera output | Needs OBS and per-OS camera stacks (#231-#233, #235). |

### The privacy invariant

`scripts/check-privacy-invariants.mjs` asserts the claim the product makes on
its own front page. Two properties:

1. No value derived from a raw-frame API — `getImageData`, `toDataURL`,
   `toBlob`, `captureStream`, `MediaRecorder`, a `MediaStream` — is passed to a
   network sink.
2. Every network sink in first-party shipped code is in a reviewed inventory
   that says what crosses the wire. A new way to reach the network fails until
   someone writes that down.

It runs from `pnpm test`. Property 1 is a textual dataflow check, not a proof:
it catches the realistic regression (someone posts a frame, or sends a canvas
export over the transport) and property 2 is the backstop for what a textual
scan would miss.
