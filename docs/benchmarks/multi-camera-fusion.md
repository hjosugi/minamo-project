<!-- i18n: language-switcher -->
[English](multi-camera-fusion.md) | [日本語](multi-camera-fusion.ja.md)

# Two-Camera Drum Fusion Prototype

Status: **prototype result for issue #241 — PASS on the software gates, BLOCKED
on the hardware gates.** Research decision it follows from:
[../research/multi-camera-fusion.md](../research/multi-camera-fusion.md) (#183).

## What this settles, and what it does not

#183 kept multi-camera fusion out of MVP and handed a prototype gate to #241 so
that "documentation-only N/A" could never be mistaken for a working feature. This
is that prototype: `src/core/multiCamera.ts` plus a deterministic synthetic
benchmark.

It runs on a simulated kit, and the split matters:

- **Settled here.** Whether the calibration, triangulation and clock maths are
  correct; whether the rejection paths actually fire; whether a second view
  recovers occluded strokes in principle; whether the existing `DrumHitEvent`
  path consumes fused output unchanged; whether unplugging camera 2 leaves
  camera 1 working.
- **Not settled here, and this is why #241 stays open.** Detector accuracy on
  real video, rolling-shutter skew, real calibration stability over a session,
  and whether a second camera is worth the setup cost to a real drummer. Those
  need the consented two-camera clips the issue still blocks on. A synthetic
  camera sees the tip perfectly or not at all; a real one sees it badly, which is
  the case that decides the feature.

Nothing here closes #183 as an implemented feature.

## How to reproduce

```
pnpm bench:multicam          # tables
pnpm bench:multicam --json   # machine-readable
```

`scripts/bench-multicam-fusion.ts` is deterministic — a seeded PRNG for the
noise and a fixed 60 fps timebase — so the numbers below are reproducible rather
than a sample of one run. It self-checks and exits non-zero if a gate regresses.

Scenario: 4 bars at 100 bpm, 40 strokes over 9.6 s. Hi-hat eighths for two bars,
ride eighths for two, backbeat snare, three calibrated zones. The `front` camera
is the default single webcam; `side` is the added view, on its own clock. The
front camera loses the hi-hat for bar 2 and the ride for bar 4 — 16 of the 40
strokes — which is the occlusion a second angle exists to cover.

## The two layers, and why they have different depth rules

#183 fixed the shape: cameras are independent trackers publishing candidates,
and a fusion stage aligns them in a shared frame. That is two layers, and the
difference between them is the one design decision worth reading:

- **Trajectory layer** (`fuseCameraObservations`) triangulates per-frame stick
  tips from **two** views. One view is rejected, never guessed. A single ray
  leaves depth free, and inventing it would hand `DrumHitDetector` a vertical
  velocity no camera measured — the velocity that decides whether a stroke is a
  hit at all.
- **Candidate layer** (`fuseCameraHitCandidates`) merges hits each camera's own
  detector published. Here one view **is** enough, because a hit means the tip
  is at the drum head, and the calibrated head plane supplies the missing depth.
  The constraint is valid at exactly the instant it is used.

That asymmetry is the whole reason the occlusion case works. If fusion required
two views everywhere, a stroke hidden from the front camera would produce
nothing — the failure the second camera was added to fix.

Candidates are matched across cameras by **ray agreement, not by the zone label
each camera reported**. Two cameras disagreeing about the zone are still
describing one stroke, and settling that disagreement geometrically is what the
second view is for. Matching on time alone would instead merge a hi-hat and a
snare struck on the same beat; their cross pairs miss each other by tens of
centimetres, so ray matching keeps them apart.

## Results

Measured 2026-08-06 at 60 fps, seeded noise, 40 strokes over 9.6 s.

### Extrinsic calibration

| Camera | Checkpoints | Mean reprojection (px) | Max (px) | Threshold (px) | Accepted |
|---|---|---|---|---|---|
| front | 6 | 1.69 | 3.02 | 3 | yes |
| side | 6 | 2.55 | 4.31 | 3 | yes |

Threshold `MULTICAM_MAX_REPROJECTION_ERROR_PX = 3`. Three pixels at 1280x720 is
well under the angular size of the smallest kit zone at a 1.5 m working
distance, so an accepted calibration cannot move a hit into a neighbouring zone
on its own. Fewer than four checkpoints is refused outright: a rigid transform
has six degrees of freedom and validating it against three points can pass while
the transform is badly wrong.

### Capture timestamp alignment

| Metric | Measured | Threshold |
|---|---|---|
| Sync events | 5 | >= 3 |
| Skew at run start | 137.71 ms | corrected, not gated |
| Drift | -2.96 ms/min | 5 ms/min |
| Fit residual | 2.38 ms | 8 ms |
| Residual skew after alignment, full run | 0.497 ms | 8 ms |

A least-squares line fitted through paired capture times of shared physical
events. Constant skew is corrected, so it is reported and not gated; what is
gated is the **residual** — what survives correction and lands directly in hit
timing error — and the **drift**, because the fit is only valid over the span it
was measured on. At the 5 ms/min limit a three-minute run accumulates 15 ms of
extrapolation error, still inside the drum benchmark's 35 ms matching tolerance.

The 137.71 ms skew is worth noting on its own: it is four full frames. Two
cameras that were never aligned would put every second-camera stroke outside the
tolerance, which is why an unaligned second clock is refused rather than assumed
close enough.

### A/B: one camera vs two, same strokes

| Metric | One camera (front) | Two cameras |
|---|---|---|
| Detected | 24 | 40 |
| Matched of 40 | 24 | 40 |
| Precision | 1.000 | 1.000 |
| Recall | 0.600 | 1.000 |
| False double hits | 0 | 0 |
| Mean timing error (ms) | 1.96 | 2.21 |
| p95 timing error (ms) | 4.37 | 5.14 |
| Zone accuracy | 1.000 | 1.000 |
| Hand accuracy | 1.000 | 1.000 |
| Mean position error (m) | 0.0093 | 0.0070 |
| p95 position error (m) | 0.0242 | 0.0183 |
| Corroborated strokes | 0 | 24 |

All 16 strokes the front camera never saw were recovered by the second camera.

Read this narrowly. The recall gap is exactly the occlusion the scenario builds
in, so it measures that a second view **can** cover a blind spot, not how often a
real front camera has one. The two-camera timing is very slightly *worse*
(2.21 ms vs 1.96 ms mean) because a corroborated stroke averages two cameras'
detector jitter and the second camera is the noisier one — averaging is not free
when the inputs are unequal, and at this scale it does not matter, but it is the
opposite of the direction one would assume.

Zone accuracy is 1.000 for **both**. In this layout the three zones project far
apart in the front view, so a flat nearest-zone attribution is already correct
and the second camera has nothing to fix. That is a real result and worth stating
plainly: **on this material the second camera's measured benefit is occlusion
recovery, not zone accuracy.** Zone disambiguation is still exercised — a unit
test drives a stroke where the two cameras disagree and triangulation settles it —
but the benchmark does not show it paying off, and a kit with overlapping zones
in the front view would be needed to demonstrate that it does.

### Trajectory layer through the existing detector

Triangulated stage samples: 872, with 280 single-view frames rejected rather
than depth-guessed. Stage position error against ground truth: **mean 5.7 mm,
p95 10.5 mm**. That is the number that belongs to fusion, and it is the gate the
harness enforces.

Feeding that track to the shipped `DrumHitDetector` produces 81 detections for
40 strokes, recall 0.625, median timing bias −81.4 ms.

### Finding: DrumHitDetector re-fires throughout a descent

The over-count above is not a fusion error — the track feeding it is accurate to
millimetres. It is a property of `DrumHitDetector` that this prototype is the
first thing to surface, because it is the first metric stage-frame track the repo
has had:

A zone is a **sphere** of `radius` about the head centre, and the detector fires
whenever the tip is inside it, descending faster than
`DRUM_DOWNSTROKE_MIN_SPEED_MPS`, and either re-armed or past `cooldownMs`. On a
realistic kit the radius **exceeds the height a stick is lifted between strokes**
— a 14" snare is 0.18 m in radius while a stick lifts about 0.11 m — so the tip
never leaves the sphere. The #123 rebound re-arm measures the lift against the y
at which the last hit fired, and that y is near the *apex*, so it never re-arms
either. `cooldownMs` is then the only limit, and the detector emits a burst of
hits every cooldown for the whole descent, firing several centimetres above the
head. The measured −81.4 ms bias is that first, early fire.

The #123 rebound test does not catch this because it feeds one sample per stroke
phase; the effect needs a continuously sampled descent to appear.

This is **not fixed here.** Changing when a hit fires is drum-detection work that
belongs to #121/#235 and needs real clips to tune against — the plausible fixes
(fire on the vertical velocity sign change, or measure the re-arm from the lowest
observed y rather than the firing y) each trade against the fast-roll behaviour
#123 was built to protect. It is recorded so that whoever runs the real-drum
verification is not surprised by it, and so the hit counts above are not read as
a fusion result.

### Camera 2 disconnected

With the second camera removed from the registration and nothing else changed,
`front` remains usable, `degradedToSingleCamera` is true, and 24 hits are still
produced — identical to the single-camera baseline. The second camera is
additive: it cannot take the first one down with it.

## What a source has to prove before it is fused

Every rejection is mechanical and reported with a reason, because #183's warning
was specifically about combining incompatible coordinates rather than about
getting the maths wrong:

| Reason | Fires when |
|---|---|
| `uncalibrated` | the camera's reprojection check was never passed |
| `stageFrameMismatch` | two cameras name different stage frames — **all** cameras are disqualified, not a majority picked |
| `clockUnaligned` | a non-reference camera has no accepted clock model |
| `stale` | the observation is older than `MULTICAM_MAX_SAMPLE_AGE_MS` |
| `nonFinite` | any NaN/Infinity in time, image point or confidence |
| `lowConfidence` | below `MULTICAM_MIN_OBSERVATION_CONFIDENCE` |
| `behindCamera` | the image point does not back-project to a valid ray |
| `singleView` | trajectory layer only: one view, so depth is unknown |
| `parallelRays` | the two rays are too close to parallel to triangulate |
| `rayGap` | the two views disagree in space by more than `MULTICAM_MAX_RAY_GAP_M` |
| `duplicate` | one camera reported the same zone twice inside the merge window |
| `noZoneIntersection` | the resolved point is not on any calibrated head |

The `rayGap` path is the multi-camera false positive guard and the one worth
keeping in mind: without it, a second camera whose calibration has drifted turns
every stroke into a double trigger, which is strictly worse than not having it.

## Side effect: the benchmark scorer could not measure a backbeat

Building the A/B surfaced a defect in `scoreDrumBenchmarkEvents`, fixed in the
same change. It matched expected hits to detections **by time alone**. Two limbs
land on the same beat in most grooves — a backbeat snare under hi-hat eighths is
the common case — so the snare's expected hit could consume the hi-hat's
detection. A perfectly zone-correct run scored one zone error per backbeat, and
the stolen detection also depressed recall for the hit that had a correct one
waiting.

It now runs two passes: same-zone pairs are reserved first, then the leftovers
match across zones as before. A genuine misattribution is still counted as one,
and expected hits with no `zoneId` keep the original behaviour. This affects any
recorded drum benchmark with two limbs on a beat, so previously recorded zone and
hand accuracy figures for such clips were pessimistic.

## Remaining gates for #241

Software, done here: extrinsic calibration with a measured threshold, timestamp
skew and drift, candidate fusion through the existing `DrumHitEvent` path,
explicit rejection of stale/uncalibrated/frame-incompatible sources, and the
one-camera/two-camera A/B.

Hardware, still open: two real cameras on one kit, consented clips, measured
reprojection error and clock drift from real capture, the A/B rerun on that
material, and the environment/consent/commit evidence record using the PR #220
templates. Raw video stays on each capture device throughout; nothing in this
prototype moves frames off-device.
