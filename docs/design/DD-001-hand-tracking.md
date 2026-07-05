# DD-001: Hand Tracking

Status: design. Backlog: KGM-022, KGM-024, KGM-026.

## Problem

Hands are the second most expressive channel after the face. Webcam hand
tracking is feasible (MediaPipe Hand Landmarker, 21 landmarks per hand) but
naive integration doubles inference cost and floods the protocol.

## Goals

- Two-hand tracking on a mid-range GPU without dropping face below 50 fps.
- Compact wire representation: <= 16 bytes per hand.
- Natural VRM finger motion, not raw landmark puppeteering.

## Non-goals

- Sign-language fidelity. Object interaction. Depth-accurate wrist position.

## Design

### Scheduling

Face runs every video frame. Hands run on alternate frames (30 Hz at a
60 Hz camera) on the same WASM fileset. Hand results are filtered with
their own One Euro instances tuned slower (minCutoff 1.0), so the
half-rate update is invisible after easing in the viewer.

### Solver

Per hand, from the 21 world landmarks:

1. Wrist orientation: build a basis from wrist->middleMCP (forward) and
   indexMCP->pinkyMCP (across); orthonormalize; convert to quaternion.
2. Finger curl per finger f in {thumb, index, middle, ring, pinky}:
   curl_f = normalized angle sum over the two interphalangeal joints,
   remapped to [0, 1] by per-finger min/max constants.
3. Thumb opposition: angle between thumb direction and palm normal, [0, 1].
4. Spread (optional, v2): average abduction of index..pinky, [0, 1].

Output per hand: quat (wrist, relative to a calibrated rest) + 6 scalars.

### Wire format (KGM2 HAND block)

| Size | Field |
|---|---|
| 1 | flags: bit0 left present, bit1 right present |
| per hand: 4 | wrist quat, smallest-three (DD-006) |
| per hand: 6 | u8 x6: five curls + thumb opposition |
| per hand: 6 | i16 x3 wrist position mm, hip-centered |

16 bytes per hand, 33 bytes for both including flags.

### VRM application

Each curl drives the three finger bones with coupling weights
proximal 1.0 / intermediate 0.85 / distal 0.7, through an ease-in curve so
half-curl looks relaxed rather than robotic. Wrist quat goes to the hand
bone relative to the solved forearm (KGM-024); until arm solving lands,
wrist rotation is applied at 50% weight to avoid fighting the static arm.

## Milestones

1. Solver + local preview on the built-in bot (no protocol change).
2. KGM2 HAND block behind the version gate.
3. VRM finger mapping + coupling curves.
4. Scheduling and perf validation on integrated GPU.

## Risks

- Hand/face model contention on one GPU queue: measure; if needed, move
  hand inference to a Worker with OffscreenCanvas.
- Left/right flips in mirror mode: resolved tracker-side like face L/R.
