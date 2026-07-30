<!-- i18n: language-switcher -->
[English](occlusion-robust-hands.md) | [日本語](occlusion-robust-hands.ja.md)

# Research: WiLoR and ReJSHand for Occlusion-Robust Hands

Status: research pass for issue #271. Both candidates are rejected on licensing,
which is established from source and does not need hardware to settle. Related:
granular backlog 009–026 (hands), #23, #222,
[onnx-wholebody-pose.md](onnx-wholebody-pose.md) (#269).

## Goal

Decide whether WiLoR's detector or ReJSHand should replace or augment MediaPipe
Hand Landmarker for occlusion-robust hand tracking.

## Acceptance criteria

- [x] The goal is clear.
- [x] Acceptance criteria are clear.
- [x] Does not contradict the existing design: MediaPipe stays the hand backend
  and nothing in the pipeline changes.
- [x] **Licence and model-size audit for both** — #271's first plan item.
- [x] Decision: adopt detector-only, full model, or stay on MediaPipe.
- [ ] ONNX export and benchmark per the #222 harness. **Not done, and must not
  be** — see below; for WiLoR the export would itself be a licence violation.
- [ ] A/B against MediaPipe on the golden clips. **Not done** — moot once both
  candidates are rejected.

## Findings

### WiLoR is CC-BY-NC-ND, and that forbids the ONNX export the plan calls for

Verified on the project repository: **the code and the pretrained models are both
under CC-BY-NC-ND.** The detector is distributed separately (`detector.pt`) from
the ViT reconstructor (`wilor_final.ckpt`), so #271's "evaluate the detector
alone" is technically coherent — but the licence covers the weights either way.

Two clauses matter, and the second is the one that changes what can even be
attempted:

- **NC — non-commercial.** This project ships a VTuber tool under permissive
  terms. Bundling a non-commercial artefact contaminates the distribution and
  puts every downstream user in an unclear position.
- **ND — no derivatives.** Converting `.pt` weights to ONNX produces a derivative
  work. So the plan's second item, "ONNX export; benchmark on WebGPU EP / WASM",
  is not blocked on effort or on the `onnxruntime-web` gate — **it is something
  this project should not do at all.**

The dependency chain compounds it: WiLoR builds on HaMeR, **Ultralytics**
(AGPL-3.0, the same licence that rules YOLO11-pose out of the default build per
DD-002) and **MANO**.

### ReJSHand states no licence, and needs MANO regardless

The repository specifies **no licence**. Absent an explicit grant, the default is
all rights reserved — which is not a vendoring candidate, and is a stricter
position than a permissive licence, not a looser one.

Beyond that: training is FreiHAND-only (the caveat #271 already flags), the README
directs users to "refer to the FreiHAND toolbox to perform the MANO model and
generate vertices", and **no ONNX export is provided**. It outputs keypoints and a
MANO mesh.

### MANO is the common root, and it is non-commercial

Both candidates depend on MANO, whose terms are a "Software Copyright License for
non-commercial scientific research purposes". It explicitly prohibits using the
software to train methods for commercial use, and states the software "shall not
be copied, shared, distributed, re-sold, offered for re-sale, transferred or
sub-licensed in whole or in part".

That is the structural finding: **the entire lightweight-hand-mesh research line
is built on MANO, and MANO cannot be redistributed commercially.** It is not a
property of these two papers. Any future candidate in this family inherits the
same blocker, so the audit result generalises — which is worth knowing before
someone evaluates the next one.

This also disposes of the **AnyHand** synthetic-dataset note in #271: it is
relevant only if this project fine-tunes a small hand model, and fine-tuning
needs a permissively-licensed base. The dataset does not supply one.

### Even without the licensing, the wire format discards the benefit

`shared/codec.js` defines `HAND_TARGET_BYTES = 16` — "flags + handedness +
confidence + curls + spreads + wrist xyz", with at most two hands per frame.

A MANO mesh is hundreds of vertices plus pose and shape parameters. Transported,
it collapses to per-finger curl and spread scalars and a wrist position. So
ReJSHand's mesh — the thing that makes it interesting — would be computed and
then thrown away at the encoder.

This is the same pattern recorded for RTMW in #269, where 68 face landmarks
cannot become the 52 ARKit blendshapes KGM1 actually carries. **The wire format,
not the model, is what bounds what a richer hand model can deliver here.** A
candidate is only worth evaluating if it improves curl, spread, wrist position or
detection continuity — the four things that survive encoding.

## Decision

**Stay on MediaPipe Hand Landmarker (Apache-2.0). Reject both candidates.**

- **WiLoR: reject, and do not export.** CC-BY-NC-ND on code and weights, over an
  Ultralytics/AGPL and MANO dependency chain. The ND clause means the evaluation
  step itself is off-limits, so this is not "revisit when we have a GPU" — it is
  closed unless the authors relicense.
- **ReJSHand: reject.** No licence stated, so all rights reserved; MANO
  dependency for the mesh; no ONNX export; FreiHAND-only training.
- **AnyHand: not actionable** on its own, for the reason above.

Recorded so this audit is not repeated. Both rejections are on licensing, which
does not change with better hardware or a resolved `onnxruntime-web` review — the
two things that gate most other open work here.

**What would actually be worth watching** is a permissively-licensed hand
detector, since WiLoR's genuine contribution is detector robustness under
occlusion rather than the ViT reconstructor. The gap for this project is
licensing, not research maturity.

Meanwhile the current design already compensates for detector dropout rather than
preventing it: `HandTargetStabilizer` holds the last good target for `holdMs`
(250 ms default) and clamps per-frame curl and spread deltas
(`maxCurlDelta = 0.24`, `maxSpreadDelta = 0.36`). That trades staleness for
continuity — up to ~15 frames of held pose at 60 fps. Reducing how often that
trade is invoked is what a better detector would buy, and it is measurable
against the existing golden clip once a licensable candidate exists.

## Sources

- WiLoR (licence, separate detector/reconstructor distribution) — <https://github.com/rolpotamias/WiLoR>, paper <https://arxiv.org/abs/2409.12259>
- ReJSHand (no licence stated, FreiHAND, MANO mesh) — <https://github.com/daishipeng/ReJSHand>
- MANO licence — <https://mano.is.tue.mpg.de/license.html>
