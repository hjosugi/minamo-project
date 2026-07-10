# Research: Multi-Camera Fusion for Drummer Mode

Status: research design for issue #183. Out of MVP scope; kept as a design doc.
Related: #23 (full-body ONNX), #184 (phone companion).

## Goal

Evaluate whether a second camera angle materially improves drummer-mode
tracking (stick tips, kit zones, foot pedals) over the single-webcam baseline in
[../tracking/drum-performance-tracking.md](../tracking/drum-performance-tracking.md),
and define the smallest integration that would not contradict the current
local-first, single-camera design.

## Acceptance criteria

- [x] The goal is clear.
- [x] Acceptance criteria are clear.
- [x] Does not contradict the existing design: multi-camera stays optional; the
  single-webcam path remains the default and never regresses.
- [x] Documentation review ([PR #220 review record](../verification/pr-220/research-review/183.md)).
- [x] Manual verification: `N/A` for this research-only decision because no
  prototype exists; follow-up #241 owns the calibration/sync prototype gate.

## Findings

- The hardest single-camera failures are occluded foot pedals and stick-tip
  depth near the kit. A second angle (e.g. a side/low camera) directly addresses
  both, but adds calibration and sync cost.
- Fusion needs a shared clock. The repo already has `estimateClockOffset`-style
  helpers for KGM2 and multi-source clock sync; a second camera would reuse that
  rather than inventing new time handling.
- Zone geometry must be expressed in a common stage frame. Each camera keeps its
  own 2D calibration; hits are fused in the shared stage space, mirroring the
  existing fusion-and-cooldown stage of the drum pipeline.
- Every camera needs an extrinsic transform into that stage frame. A prototype
  must measure reprojection error and reject stale/missing calibration instead
  of combining incompatible coordinates.
- The current `estimateClockOffsetMs` helper aligns relay clocks; it is a useful
  starting point, not proof of camera synchronization. A prototype must also
  measure capture timestamp skew and drift over the full benchmark run.

## Decision

Keep multi-camera fusion **out of MVP** and behind an optional capability, for
three reasons: it requires a second device, extrinsic calibration, and tighter
sync than a single webcam. Record the intended shape so it does not surprise the
architecture later:

- Cameras are independent tracker instances publishing stick/zone candidates.
- A fusion stage aligns candidates by the shared clock and stage frame, then
  runs the same hit fusion/cooldown as today.
- The phone-companion path (#184) is the most likely first "second camera."

Revisit after phone companion (#184, implementation gates #226–#228) and
full-body ONNX (#23/#222) land, since both supply pieces this feature would
depend on. Prototype follow-up #241 defines extrinsic calibration, timestamp
skew/drift limits, a single-camera A/B baseline, and kit-zone accuracy metrics.
No prototype code exists in this research pass.
