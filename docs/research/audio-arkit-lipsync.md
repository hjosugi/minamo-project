<!-- i18n: language-switcher -->
[English](audio-arkit-lipsync.md) | [日本語](audio-arkit-lipsync.ja.md)

# Research: ONNX Audio→ARKit Lipsync Models

Status: research pass for issue #268. Evaluates the learned-model candidates for
the "v2 small ML" slot [DD-003](../design/DD-003-audio-lipsync.md) reserved.
Related: KGM-045, KGM-046, #222 (the ONNX Runtime Web dependency this shares).

## Goal

Decide whether one of wav2arkit_cpu, LAM_Audio2Expression or NVIDIA
Audio2Face-3D should replace the shipped energy/heuristic lipsync, and under
what conditions. DD-003 already reserved the slot — "Small ML (v2): a tiny
CNN/GRU on log-mel frames … via ONNX Runtime Web (wasm EP) … Ship (1) first;
(2) behind the same interface" — so the question is not whether the design
allows a learned model, but whether any of these three actually fits the latency
budget that design commits to.

This pass is documentation-level: it settles licensing, artefact shape and the
latency arithmetic from upstream sources, and states precisely which single
measurement decides the outcome.

## Acceptance criteria

- [x] The goal is clear.
- [x] Acceptance criteria are clear.
- [x] Does not contradict the existing design: any adopted model sits behind
  DD-003's existing fusion rule and drives the same ARKit mouth channels, so the
  protocol is unchanged and vision keeps ownership of shape at high confidence.
- [x] License review for each candidate (redistribution, commercial use).
- [x] Written decision — adopt / adapt / reject per model.
- [x] Latency **analysis** against DD-003's budget, including the distinction the
  issue's plan does not draw (see below).
- [ ] Latency **measurement**: model inference plus buffering vs the current
  worklet. **Not done** — the deciding quantity is minimum viable chunk length,
  which is undocumented upstream and has to be measured.
- [ ] Quality A/B on the vowel fixtures vs the energy baseline. **Not done, and
  blocked on fixtures that do not exist** — see "There are no vowel fixtures".
- [ ] ONNX Runtime Web (WASM) real-time feasibility on a low-end laptop.
  **Not done** — needs the dependency, which is itself gated (see #222).

## Findings

### What ships today

`shared/audio-lipsync.js` plus `tracker/audio-lipsync-worklet.js`: an AudioWorklet
computes RMS and low/mid/high band energies, posts a viseme frame every
**20 ms** (`TARGET_POST_INTERVAL_MS`), smooths with attack 30 ms / release
120 ms, and the tracker fuses it into the existing ARKit mouth channels.
`AUDIO_LIPSYNC_TARGET_LATENCY_MS = 80`, and frames older than that are dropped
rather than replayed late. That 80 ms is the budget any replacement must fit.

Note an inconsistency to resolve: #268 states a target of "mouth-audio offset
< 60 ms end-to-end", while DD-003 and the shipped constant both say 80 ms. The
code is the authority here; the issue's 60 ms appears to be new and stricter,
and if it is intended it makes the candidates *harder* to fit, not easier.

### wav2arkit_cpu — the only browser-viable candidate

Confirmed from the model card:

| Property | Value |
|---|---|
| License | Apache-2.0 |
| Artefact | `wav2arkit_cpu.onnx`, **1.8 MB** |
| Input | 16 kHz mono float32 waveform, `[batch, samples]` |
| Output | `[batch, frames, 52]` ARKit blendshapes at 30 fps |
| Frames | `output_frames = ceil(30 × num_samples / 16000)` |
| Throughput | "~45 ms per second of audio", "22× faster than realtime" |
| Derived from | `facebook/wav2vec2-base-960h` + `3DAIGC/LAM_audio2exp` |

1.8 MB is small enough to be a rounding error next to the vendored MediaPipe
models, and Apache-2.0 clears redistribution. Both are strong marks.

**But the stated provenance and the artefact size do not reconcile.**
`wav2vec2-base-960h` is roughly 95M parameters — hundreds of MB in fp32, tens of
MB even int8-quantized. A 1.8 MB artefact cannot contain it. So "derived from"
must mean a distilled or heavily truncated student, not the base encoder. That
matters because the quality one would expect from "Wav2Vec2-based" is not the
quality one should expect here. Establish what the encoder actually is before
treating the lineage as a quality argument.

### The latency gate: throughput is not latency

This is the finding that decides the issue, and the evaluation plan in #268
gestures at it ("model inference + buffering") without following it through.

"22× faster than realtime" and "~45 ms per second of audio" are **throughput**
figures. They say the model is not compute-bound, which is genuinely good news
for a WASM execution provider. They say nothing about **algorithmic latency** —
how much audio must be buffered before the current frame can be emitted.

The arithmetic against DD-003's 80 ms budget:

- Output is 30 fps, so one output frame is a **33 ms** hop. The whole budget is
  roughly two output frames wide, and the existing worklet already spends 20 ms
  of it on its own posting interval.
- Feeding the documented 1-second example window would add **~1000 ms** of
  buffering delay — over 12× the budget. Unusable for live lipsync in that form.
- To fit inside 80 ms the model would have to be valid on chunks of roughly
  64–80 ms (1024–1280 samples at 16 kHz). Whether a transformer-style encoder
  produces sensible blendshapes with that little context is **not documented**,
  and short-context degradation is exactly where such models fail.

So compute is not the problem; buffering is. The single measurement that decides
adoption is: **the shortest chunk at which output quality holds, and whether
that chunk fits 80 ms.** Everything else about this model is favourable.

### 52 outputs does not mean 52 driven channels

The issue's framing — "emit the exact 52 ARKit blendshapes Minamo already
transports, making a drop-in quality upgrade plausible" — overstates the fit.
DD-003 deliberately restricts audio to the mouth channels (`jawOpen`,
`mouthFunnel`, `mouthPucker`, `mouthStretch*`) and gives vision ownership of
shape whenever visual confidence is high. Letting an audio model write brow,
eye or gaze channels would put it in direct conflict with the tracker, which
owns those from the camera.

A learned model is therefore adopted as a better *mouth* estimator behind the
unchanged fusion rule, and most of its 52 outputs are discarded by design. That
is fine — but it means the upgrade is narrower than "drop-in", and the protocol
being unchanged is a property of DD-003's fusion rule, not of the model.

### LAM_Audio2Expression — largely redundant with wav2arkit

Apache-2.0, weights on HuggingFace / Aliyun OSS / ModelScope
(`lam_audio2exp_streaming.tar`, size not disclosed), with both windowed and
streaming inference scripts and a browser-oriented WebGL avatar SDK.

Two reasons not to evaluate it separately as an ORT Web candidate:

1. **No ONNX export is published.** For this repo that makes it a conversion
   project, not an integration.
2. wav2arkit_cpu already *is* its decoder (`3DAIGC/LAM_audio2exp`) fused with an
   audio encoder and exported to ONNX. Evaluating LAM independently would mostly
   re-derive the same answer with more work.

It stays relevant only as the upstream to consult if wav2arkit's short-chunk
behaviour turns out to be a fusion/export artefact rather than a model property.

### Audio2Face-3D — out of scope for the browser

#268 already classifies this as a desktop companion (Tauri sidecar) rather than
an in-browser option, and that is the right call: a ~100 MB PyTorch/TensorRT
model is not an ORT Web target.

Recorded honestly: **the NVIDIA blog post linked from the issue does not state
the license name, model output format, blendshape count, artefact size, or
framework.** Those attributes in the issue body are unverified against that
source and would need the model card or arXiv 2508.16401 to confirm.

Beyond the source question there is a product one: shipping it as a desktop-only
sidecar would give the Tauri build materially better lipsync than the web build
from the same repo. That is a divergence worth deciding deliberately rather than
discovering.

### There are no vowel fixtures

The evaluation plan's "Quality A/B on the vowel fixtures (A-I-U-E-O separation,
plosive closure)" has nothing to run against. What exists is:

- `inferVowel` in `shared/runtime.js`, a **visual** heuristic deriving a vowel
  from mouthOpen / mouthWide / pucker, consumed by `src/adapters/vrm_mapper.ts`.
- Lipsync tests that call `estimateAudioLipsyncFrame({ rms, low, mid, high })`
  with synthetic band energies — not audio.

No speech audio fixtures exist, and the repo's privacy invariants push back on
creating them by recording: raw audio is not committed (`containsRawAudio: false`
in the dataset schema; the drum fixtures explicitly commit timestamps rather
than media). So the A/B step needs **synthetic or TTS-generated** vowel and
plosive fixtures, committed as audio only if that is compatible with the privacy
rules, or as derived features otherwise. That is a prerequisite task, not a step
that can be run today.

## Decision

**wav2arkit_cpu: adopt conditionally.** It is the only candidate that is
simultaneously Apache-2.0, published as ONNX, small enough to ship (1.8 MB), and
already emitting the ARKit basis this project transports. Adoption is gated on
one measurement — the shortest audio chunk at which its output stays usable, and
whether that fits DD-003's 80 ms budget. If it needs a quarter-second or more of
context, reject it for the live path; it may still be worth keeping for
non-realtime uses such as post-processing a recording, where buffering is free.

**LAM_Audio2Expression: covered by the above.** No ONNX export, and wav2arkit is
its decoder already exported. Do not spend a separate evaluation on it unless
wav2arkit's short-chunk behaviour looks like an export artefact.

**Audio2Face-3D: reject for now.** Not a browser target by its own weight class,
its attributes are unconfirmed against the source the issue cites, and adopting
it desktop-only would split lipsync quality between the two builds this repo
ships.

**Keep the energy/heuristic path as the default** either way. DD-003's
"Ship (1) first; (2) behind the same interface" still holds, and nothing here
justifies moving the default before the latency gate is measured.

Two dependencies worth stating plainly: any of this needs `onnxruntime-web`,
whose addition is gated on the supply-chain review described in
[onnx-wholebody-pose.md](onnx-wholebody-pose.md) (#269) and
[../DEPENDENCY_POLICY.md](../DEPENDENCY_POLICY.md) — the same gate #222 hits. And
the quality half of this evaluation cannot start until the vowel fixtures exist.

## Sources

- wav2arkit_cpu model card — <https://huggingface.co/myned-ai/wav2arkit_cpu>
- LAM_Audio2Expression — <https://github.com/aigc3d/LAM_Audio2Expression>
- NVIDIA Audio2Face open-source announcement —
  <https://developer.nvidia.com/blog/nvidia-open-sources-audio2face-animation-model/>
- Audio2Face-3D paper referenced by #268 — <https://arxiv.org/abs/2508.16401>
  (not consulted in this pass)
