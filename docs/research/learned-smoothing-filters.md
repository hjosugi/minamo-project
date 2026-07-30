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

### The cheaper win the benchmark exposes

With the baseline measured, the three presets turn out not to span the
`(minCutoff, beta)` space. The `headRotation` default (1.2, 0.8) beats the
`balanced` preset (1.6, 0.4) on both jitter (0.085 vs 0.106) and step lag
(100 vs 133 ms), paying for it only in sustained-motion tracking (0.0581 vs
0.0543 RMSE). `beta` — the adaptive derivative gain that is the whole point of
One Euro over a fixed low pass — is doing more work than the preset ladder
suggests.

A sweep of that space with `pnpm bench:filters` costs minutes and no new
dependency. It should be exhausted before anyone proposes shipping a neural
network into a 60 fps loop, because if it captures most of the available gain the
learned filter has to beat a much stronger baseline than the one #270 assumed.

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
than the paper's results imply. Before any porting effort, run the sweep below —
and when FLK is measured, hold it to the four criteria in
[../benchmarks/filter-response.md](../benchmarks/filter-response.md), especially
overshoot, which a Kalman filter with a learned motion model can produce and
One Euro cannot.

**Do the preset sweep first.** It is the highest ratio of expected gain to risk
available here, needs no dependency, and sharpens the baseline that any learned
filter must beat.

## Sources

- FLK: A filter with learned kinematics for real-time 3D human pose estimation
  (Signal Processing 224, 2024) —
  <https://www.sciencedirect.com/science/article/pii/S0165168424002172>,
  code <https://github.com/PARCO-LAB/FLK>
- Real-Time ESFP: Estimating, Smoothing, Filtering and Pose-Mapping (HPSTM) —
  <https://arxiv.org/abs/2506.21234>
- SmoothNet (ECCV 2022) — referenced by #270 as a window-based baseline; not
  consulted in this pass.
