<!-- i18n: language-switcher -->
[English](face-expression-gaze-quality.md) | [日本語](face-expression-gaze-quality.ja.md)

# Research: SMIRK-class Expression Capture and MobileGaze

Status: research pass for issue #273. Every candidate is settled on licensing
and on output space, neither of which needs hardware. Related: granular backlog
039–053 (face), KGM-016 (true gaze), `DD-006-kgm2.md`,
[face-quality-benchmarks.md](../benchmarks/face-quality-benchmarks.md) (#106,
#107), [occlusion-robust-hands.md](occlusion-robust-hands.md) (#271),
[onnx-wholebody-pose.md](onnx-wholebody-pose.md) (#269).

## Goal

Decide whether SMIRK-class FLAME expression capture is worth an optional quality
mode, and whether MobileGaze should replace the iris-landmark gaze this project
already ships.

## Acceptance criteria

- [x] The goal is clear.
- [x] Acceptance criteria are clear.
- [x] **Licence audit** for SMIRK and for MobileGaze — #273's first plan item,
  extended to the training data, which is where both of them actually fail.
- [x] The issue's own premise about the FLAME licence checked rather than
  inherited.
- [x] What the existing pipeline carries established from code, so "upgrade" has
  something to be measured against.
- [x] Decision: adopt, adopt as an optional mode, or stay.
- [ ] ONNX export and fps on WebGPU/WASM — **not done**, blocked behind the same
  `onnxruntime-web` dependency review that gates #222/#269, and moot for
  candidates that cannot ship.
- [ ] MobileGaze A/B against the current iris gaze on the calibration fixtures —
  **not done**; the weights cannot ship, so an A/B would measure something
  unusable.

## Findings

### The FLAME premise in this issue is out of date, and the correction matters

#273 states: *"FLAME license is non-commercial — license review is the gate."*
That was true and is no longer true in general. **FLAME 2023 Open is released
under CC BY 4.0**, which explicitly grants the right to share and adapt the model
for any purpose including commercial use. The earlier models (2017, 2019, 2020,
Blender add-on) remain non-commercial, prohibit commercial/military/surveillance
use, prohibit training methods for those uses, and forbid redistribution.

So "FLAME-based" is no longer a blanket disqualifier. The question is now *which
FLAME a given method shipped against*.

For SMIRK the answer is the bad one. `quick_install.sh` downloads **FLAME2020**
from the MPI endpoint behind a registration prompt, plus **EMOCA's ResNet50** and
**MICA**, also from MPI. SMIRK's own MIT licence covers its code; it does not
extend to those three assets, and the published SMIRK checkpoint was produced
with them.

**The gate is therefore not "FLAME" — it is FLAME2020 + EMOCA + MICA as SMIRK
ships them.** Keeping that distinction is the useful part: a future
FLAME-2023-based method is not automatically out, which is the first time in
three research passes that the licence door is even ajar.

This also disposes of #273's "optional separately-installed mode" framing. The
assets cannot be redistributed, so a user would have to register with MPI and
accept a non-commercial licence themselves — and the non-commercial clause still
governs what they may then do with it. There is no shippable default behind that
mode.

### SMIRK's output is not this project's output, and that costs more than the licence

The encoder is **three MobileNetV3 backbones**, not one:
`tf_mobilenetv3_small_minimal_100` for pose, `tf_mobilenetv3_large_minimal_100`
for shape, and the same large backbone for expression. Outputs are 6 pose/camera
+ 300 shape + 50 expression + 2 eyelid + 3 jaw.

KGM1 carries **52 ARKit blendshapes** (`NUM_CHANNELS = ARKIT_52.length` in
`shared/blendshapes.js`), quantized to u8 on the wire (`FACE_BYTES = 66`), and
MediaPipe already outputs exactly those 52 directly.

FLAME's 50 expression parameters are PCA coefficients over a mesh basis. They are
not a subset of the ARKit set — they are a **different basis**. So
"FLAME→ARKit retargeting" is a fitted, per-topology mapping, not a lookup table.
This is the same shape of problem recorded for RTMW in #269 (68 landmarks cannot
become 52 blendshapes) and for MANO meshes in #271, and it is the harder version:
landmarks at least live in the same geometric space as the face.

Two things worth recording on the other side of the ledger, because they are easy
to get wrong:

- **SMIRK is not inherently heavy.** Its contribution — analysis by neural
  synthesis — is a *training*-time construction. At inference it is just the
  encoders.
- **Shape is identity, not expression.** The 300 shape parameters are constant
  per user, so the large ShapeEncoder belongs in a calibration step, not the
  per-frame path. A real-time budget is the small pose encoder plus one large
  expression encoder. That is an estimate, not a measurement, and measuring it
  is blocked by the same `onnxruntime-web` review as #222.

### The successors are worse on licensing, not better

- **TEASER** (ICLR 2025, `Pixel-Talk/TEASER`) — the repository declares **no
  licence at all**. Absent an explicit grant the default is all rights reserved,
  which is exactly the ReJSHand finding from #271, and a stricter position than a
  permissive licence rather than a looser one. Last pushed April 2025.
- **SuperFace** (arXiv, May 2026) — no code found, and the arXiv posting is
  **CC BY-NC-ND**. Its premise is nevertheless the most interesting of the three:
  it predicts **ARKit** coefficients directly, refining beyond software-generated
  pseudo-labels with human preference feedback on rendered expressions. If code
  ever lands under permissive terms it is a strictly better fit than SMIRK,
  because it targets this project's output space and skips the retargeting
  problem entirely. Worth watching. Not worth planning on.

### MobileGaze's code is MIT and its weights are not shippable

The repository is MIT, ships ONNX for every backbone, and MobileOne-S0 is
**4.8 MB** — precisely the size class this project can afford.

And: **all models are trained only on Gaze360.** The Gaze360 licence is
non-commercial research use only, and the operative clause extends past the
images: the material "will not be used nor included in commercial applications in
any form (such as original files, encrypted files, files containing extracted
features, **models trained on dataset**, other derivative works, etc)".

So this is the MANO pattern from #271 and the CC BY-NC pattern from #278 for the
third consecutive pass: **permissive code sitting on a non-commercial artefact.**
The code is reusable. The weights are not, and retraining needs a permissively
licensed gaze dataset — the same missing piece the AnyHand note in #271 ran into.

### Even setting licensing aside, no published number says it would be better here

| Model | Size | Gaze360 MAE |
|---|---|---|
| MobileOne-S0 | 4.8 MB | 12.58° |
| MobileNet V2 | 9.59 MB | 13.07° |
| ResNet-18 | 43 MB | 12.84° |
| ResNet-34 | 81.6 MB | **11.33°** |
| ResNet-50 | 91.3 MB | 11.34° |

For scale: `tests/run-tests.mjs:1529` asserts that calibrated iris gaze lands
within **5°** of its target, and `gazeAngularErrorDegrees(actual, target,
maxDegrees = 20)` maps the full normalized ±1 gaze range onto roughly ±20°. A
12.58° mean error is 0.63 in that normalized unit — most of the usable
half-range.

**That comparison has to be handled carefully, and the careful version is still
decisive.** Gaze360 spans 360° of head orientation including subjects facing away
from the camera; frontal-only error is much lower and the repository publishes no
frontal figure. So the conclusion is not "MobileGaze is worse". It is that **no
published number establishes it is better under this project's conditions**, and
the only number available is measured on a distribution a seated VTuber never
produces. The 5° figure is synthetic too, so both sides are unmeasured on real
clips — which is itself the finding.

One more reason the swap is not the win it looks like: MobileGaze outputs
yaw/pitch in the **camera** frame, while this project's gaze is a screen-relative
normalized `(x, y)` fitted per user by `buildGazeCalibrationProfile` (centre and
scale from a 5-point look-target flow). A model swap does not remove that affine
fit. Whatever accuracy a new model has, what reaches the avatar is what survives
the same calibration.

### Gaze is the one signal where the wire format is *not* the bound

This is the inverse of #269 and #271, and worth stating because those two passes
established the opposite reflex. `docs/design/DD-006-kgm2.md` reserves block bits
2–5 and names one of them explicitly: **GAZE (KGM-016 true gaze vector)**. KGM2
already has a slot for a real 3D gaze vector.

The current implementation does not use it. `applyGazeToWeights` in
`shared/runtime.js` zeroes the eight ARKit `eyeLook*` channels and writes the iris
estimate back into them as `x` → `eyeLookOut/In` and `y` → `eyeLookUp/Down`.
Those travel as u8 weights, and every renderer collapses them back to two numbers:
`vrm_mapper.ts:43` averages `leftEye.gaze.x` and `rightEye.gaze.x` into a yaw,
Live2D takes `ParamEyeBallX/Y`, Inochi2D takes `eye_x/eye_y`. **`gaze.z` is
computed in `src/core/face.ts` and never consumed by anything.**

So the ceiling on gaze today is two u8-quantized scalars laundered through
blendshape channels — but that is an implementation ceiling with a protocol slot
already reserved, not a format wall. If gaze quality is worth spending on, the
cheap move is KGM-016's GAZE block, not a model swap.

### The Baballonia precedent is a non-commercial project, and the transferable part is the data

#273 cites Project Babble's Baballonia as evidence that a small custom model is
maintainable by an OSS project. Checked:

- **Licence**: "Babble Software Distribution License 1.0" — Apache-2.0 text plus
  a **Section 10, "Additional Terms: Non-Commercial Copyleft Provisions"**. No
  sale, no fee-based service built around the work, no integration into monetized
  hardware, and derivative works must be released under the same licence. The
  cited precedent is itself non-commercial *and* copyleft, so nothing from it can
  be vendored.
- **The model does not transfer.** It is trained for "close up, high FOV images
  (4 inches from the lower face @ 160 degrees)" — a headset-mounted camera. A
  modified EfficientNetV2 tuned for that geometry says nothing about
  frontal-webcam expression capture, which is this project's only case.

**What does transfer is how they solved the data problem.** The production model
trains on their Synthetic Dataset v2 — rendered from 3D assets across varied face
shapes, skin textures, camera positions and lighting — with real user submissions
folded in for edge cases like facial hair and unusual angles.

That is the real lesson from the citation, and it answers the blocker that has now
stopped three research passes in a row. The missing piece is never the
architecture; it is a permissively licensed dataset. An OSS project of this size
solved that by rendering one rather than by licensing an academic one.

## Decision

1. **Reject SMIRK, including as an optional separately-installed quality mode.**
   FLAME2020 + EMOCA + MICA are non-commercial and non-redistributable, so there
   is no shippable default behind such a mode; and even licensed, its 50 FLAME
   expression coefficients need a fitted basis change to reach the 52 ARKit
   channels this project actually transmits.
2. **Reject TEASER** — no licence stated, therefore all rights reserved.
   **Watch SuperFace** — it targets ARKit coefficients directly, which is the
   right output space, but it has no code and a CC BY-NC-ND posting.
3. **Do not adopt MobileGaze's weights.** MIT code over Gaze360, whose licence
   names "models trained on dataset" explicitly. The code stays a viable starting
   point if a permissively licensed gaze dataset ever appears; the weights do not.
4. **Stay on MediaPipe Face Landmarker blendshapes plus the existing iris gaze.**
   Nothing audited here beats it on terms this project can ship.
5. **If face and gaze quality are worth spending on, spend in this order**, none
   of which needs a new model: (a) measure the current gaze on real clips, since
   the 5° figure is synthetic; (b) implement KGM-016's reserved GAZE block so the
   vector stops being laundered through u8 `eyeLook*` channels and `gaze.z` stops
   being discarded; (c) only then re-evaluate a model, against a measured
   baseline.
6. **Record the FLAME-2023 correction.** The next FLAME-based candidate should be
   judged on which FLAME version it shipped against, not on the family name.
7. **The recurring blocker is data, not models.** Four candidates across three
   passes have failed on non-commercial training assets while their code was
   permissive. Synthetic data generation — the Babble route — is the only path
   audited so far that produces a permissively licensed base, and it is worth its
   own evaluation before another model is reviewed.

## Sources

- FLAME model licence, including the CC BY 4.0 FLAME 2023 Open model — <https://flame.is.tue.mpg.de/modellicense.html>
- SMIRK (MIT code; `quick_install.sh` pulls FLAME2020, EMOCA ResNet50, MICA) — <https://github.com/georgeretsi/smirk>, paper <https://arxiv.org/abs/2404.04104>
- TEASER (ICLR 2025), no licence declared — <https://github.com/Pixel-Talk/TEASER>, paper <https://arxiv.org/abs/2502.10982>
- SuperFace (arXiv, May 2026), ARKit coefficients, CC BY-NC-ND, no code — <https://arxiv.org/abs/2605.06179>
- MobileGaze (MIT code, ONNX weights, Gaze360-only training) — <https://github.com/yakhyo/gaze-estimation>
- Gaze360 licence ("models trained on dataset") — <https://github.com/erkil1452/gaze360/blob/master/LICENSE.md>
- Babble Software Distribution License 1.0, Section 10 non-commercial copyleft — <https://github.com/Project-Babble/Baballonia>
- Babble face-tracking model, camera geometry and synthetic dataset — <https://docs.babble.diy/blog/face-tracking>
