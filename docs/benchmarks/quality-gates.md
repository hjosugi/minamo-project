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
