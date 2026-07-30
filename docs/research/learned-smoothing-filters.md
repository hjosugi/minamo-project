<!-- i18n: language-switcher -->
[English](learned-smoothing-filters.md) | [日本語](learned-smoothing-filters.ja.md)

# Research: Learned Smoothing Filters as a One Euro Successor

Status: research pass for issue #270, with the benchmark it asks for built and
the baseline measured. Related:
[../benchmarks/filter-response.md](../benchmarks/filter-response.md),
[../benchmarks/hand-stability-report.md](../benchmarks/hand-stability-report.md).

## Goal

Decide whether FLK, HPSTM/Real-Time ESFP or SmoothNet should replace One Euro
anywhere in the smoothing stack, and — because #270 asks for this first — define
and measure the benchmark that makes such a claim checkable at all.

## Acceptance criteria

- [x] The goal is clear.
- [x] Acceptance criteria are clear.
- [x] Does not contradict the existing design: One Euro stays the default, and
  any candidate would be scoped to specific channels rather than the whole stack.
- [x] **Benchmark defined**: jitter, lag, overshoot and sustained-motion tracking
  in `scripts/bench-filter-response.mjs` (`pnpm bench:filters`), self-checking
  against reference filters.
- [x] **Baseline scored**: all three presets and all five per-group defaults, in
  [../benchmarks/filter-response.md](../benchmarks/filter-response.md).
- [x] **Tuning alternative ruled out**: a 725-setting `(minCutoff, beta)` sweep
  finds nothing that dominates a shipped preset once outlier rejection counts.
- [x] Written decision per candidate, and the bar a candidate must clear.
- [ ] Port/run FLK on the pose channel and compare at equal lag. **Not done** —
  requires porting the model (Python/PyTorch upstream) to JS or ONNX, which is
  implementation work gated on the finding below about which channels it could
  even apply to.

## Findings

### The candidates filter something this project mostly does not smooth

This is the finding that reframes the issue. FLK, HPSTM and SmoothNet are **3D
keypoint-trajectory** filters. What the tracker actually runs One Euro over:

| Filter | Channels | Kind |
|---|---|---|
| `weightFilter` | 52 | ARKit blendshape weights in [0,1] |
| `quatFilter` | 4 | head rotation quaternion, renormalized |
| `posFilter` | 3 | head position, metres |
| `poseFilter` | 21 | 7 upper-body points × 3 — **the only keypoints** |
| `handCurlFilter` | 10 | per-finger curl, a derived scalar |
| `handSpreadFilter` | 10 | per-finger spread, a derived scalar |

So of roughly 100 smoothed scalars, **21 are 3D keypoints**. FLK's spatial core
is "the biomechanical constraints of the human body … spatial coherency between
keypoints"; HPSTM's decoder enforces "constant bone lengths and anatomical
plausibility". Neither has anything to constrain on a blendshape weight, a
quaternion component, or a per-finger curl scalar. There are no bones between
`jawOpen` and `browInnerUp`.

#270's premise that "the entire smoothing stack is One Euro filters" is correct.
The inference that a learned keypoint filter could therefore replace the stack is
not: at most it addresses the pose block.

### And the pose block is a weak fit even so

The pose block is 7 points — nose, both shoulders, both elbows, both wrists
(`POSE_POINTS` in `shared/blendshapes.js`). FLK's biomechanical constraints and
HPSTM's forward-kinematics decoder both assume a fuller skeleton; with no hips,
spine or legs there is little kinematic structure left to exploit, and the
constraint machinery is most of what distinguishes these filters from a
well-tuned low pass.

FLK's reported gains are also a different quantity from the one this project
cares about: "improving accuracy up to 140 mm with non-Gaussian noise and 53 mm
with missing information" is **error reduction on corrupted input** — outliers
and dropped frames — not at-rest jitter. Those are real problems, but the
tracker already handles the dropped-frame case at a different layer
(`TrackingLossSmoother`, `HandTargetStabilizer` occlusion hold), and the stated
top priority is jitter. A filter evaluated on MPJPE against ground-truth mocap
has not been shown to reduce visible shake at 60 fps.

### Two of the three candidates are non-causal, which is disqualifying

- **HPSTM / Real-Time ESFP** is "a sequence-to-sequence Transformer with
  self-attention that combines long-range temporal context with a differentiable
  forward-kinematics decoder". Long-range temporal context means future frames.
  #270 files it as "heavier; evaluate as a desktop-tier option", but the problem
  is not weight — it is that a non-causal smoother cannot produce frame *n*
  before frame *n+k* exists, at any tier. Its source paper's target is a pipeline
  driving a 4-DoF desktop robot arm, not a live avatar.
- **SmoothNet** is window-based, which #270 already labels "adds latency —
  baseline only". Agreed, and for the same structural reason.
- **FLK** is the only causal candidate: an adaptive Kalman filter with a learned
  motion model, described as zero/low latency and real-time.

So the field of live candidates is one, not three.

### The tuning space offers no free win — which sharpens the case for FLK

The obvious cheap alternative to a learned filter is better One Euro tuning, so
that was tested first: `pnpm bench:filters --sweep` scores 725
`(minCutoff, beta)` settings against every shipped configuration.

Measured on jitter, step lag and sustained-motion tracking, **every shipped
configuration is dominated**, often heavily — `pose` (0.8, 0.2) looked beatable
by (0.4, 0.8) at 41% less jitter and 61% less lag, and the result survived a
hostile clock (noise 0.05, dt jitter ±25%).

It does not survive outlier injection. Adding spike passthrough as a fourth axis,
**nothing dominates any preset: 0 of 725, for all eight configurations.** Every
apparent win came from raising `beta`, and One Euro's cutoff is
`minCutoff + beta * |dx/dt|`, so a one-frame outlier detonates the derivative
estimate and the filter opens up exactly when it should clamp. Spike passthrough
rises monotonically with `beta` — 0.144 to 0.276 across `beta` 0 to 1.2 at fixed
cutoff. The (0.4, 0.8) setting that looked free for `pose` passes 55% more of a
bad landmark than the incumbent.

So the shipped presets are Pareto-optimal on this benchmark, and there is no
retuning shortcut. The interesting consequence is what that says about FLK.

The one axis tuning cannot improve is precisely the one FLK claims: its reported
gains are "up to 140 mm with non-Gaussian noise and 53 mm with missing
information" — outliers and dropped frames, not at-rest jitter. Read against this
sweep, that stops being a mismatch and becomes the whole point. One Euro's
weakness is structural: a filter whose gain is driven by the measured derivative
cannot also reject derivative outliers. A learned motion model can, because it
has a prior about what motion is plausible.

That reframes the evaluation. FLK should not be measured on jitter at matched lag
— tuning already sits on that frontier and would likely win. It should be
measured on **spike passthrough and dropped-frame recovery at matched jitter and
lag**, which is where One Euro provably has nothing left to give.

## Decision

**Keep One Euro as the default across all channels.** Nothing here justifies
moving it, and the benchmark now exists to hold any future claim to account.

**HPSTM / Real-Time ESFP: reject for the live path.** Non-causal by
construction, not merely heavy. Revisit only for an offline path — smoothing a
recording after capture, where future frames are free — which is a different
feature from live smoothing and not currently requested.

**SmoothNet: reject, baseline only**, as #270 already proposed. Window-based.

**FLK: keep as the single live candidate, scoped to the pose block only.** Do not
port it to the blendshape, quaternion, or curl channels: its biomechanical core
is meaningless there, so what would remain is a learned Kalman filter competing
with a well-tuned One Euro on 1-D signals, which is a much weaker proposition
than the paper's results imply. When it is measured, hold it to the five criteria
in [../benchmarks/filter-response.md](../benchmarks/filter-response.md) — and
judge it on **spike passthrough at matched jitter and lag**, not on jitter, for
the reason above. Watch overshoot too: a Kalman filter with a learned motion
model can produce it and One Euro cannot.

**The preset sweep is done, and it found nothing.** The presets are
Pareto-optimal once outlier rejection is counted, so there is no cheap retuning
to try before a learned filter — that option is closed, not pending.

## Sources

- FLK: A filter with learned kinematics for real-time 3D human pose estimation
  (Signal Processing 224, 2024) —
  <https://www.sciencedirect.com/science/article/pii/S0165168424002172>,
  code <https://github.com/PARCO-LAB/FLK>
- Real-Time ESFP: Estimating, Smoothing, Filtering and Pose-Mapping (HPSTM) —
  <https://arxiv.org/abs/2506.21234>
- SmoothNet (ECCV 2022) — referenced by #270 as a window-based baseline; not
  consulted in this pass.
