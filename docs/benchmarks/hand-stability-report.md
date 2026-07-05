# Hand Stability Benchmark Report

Date: 2026-07-06

Scope: synthetic regression coverage for open palm, point, fist, impossible
curl jump, short occlusion recovery, and long occlusion omission.

## Assets

- Fixture: `tests/fixtures/hand-golden-clip.json`
- Visual page: `diagnostics/no-broken-finger.html`
- Runtime: `HandTargetStabilizer`, `classifyHandGesture`,
  `handTargetDebugRows`

## Gates

| Gate | Result |
|---|---|
| 16-byte hand target remains decodable | Covered by `tests/run-tests.mjs` |
| Impossible curl jump emits clamp warning | Covered by golden clip test |
| Stabilized per-frame curl step <= 0.24 | Covered by golden clip test |
| Short hand absence is held with recovery flag | Covered by runtime test |
| Long hand absence omits hand block | Covered by runtime test |
| Viewer has arm-solver fallback toggle | Covered by structure verification |

## Manual Use

Run the dev server and open `/diagnostics/no-broken-finger.html`. The chart
shows the stabilized index-finger curl over the synthetic clip. Yellow points
indicate recovery-held output; warning rows list clamp and recovery events.
