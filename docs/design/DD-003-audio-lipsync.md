# DD-003: Audio Lipsync Fusion

Status: design. Backlog: KGM-045, KGM-046.

## Problem

Visual mouth tracking fails exactly when streamers need it: low light, face
partially off-frame, camera below 30 fps. Audio always knows when you are
talking. VSeeFace-class tools treat audio lipsync as a fallback switch;
Minamo should fuse both continuously.

## Goals

- Mic -> viseme weights fully on-device, < 80 ms audio-to-avatar.
- Fusion, not switching: audio drives openness timing, vision drives shape.
- Zero configuration default; advanced panel for gain and sensitivity.

## Viseme estimation options

1. Formant heuristic (v1): AudioWorklet computes RMS energy + first two
   formants (LPC or band energies). Map to {aa, ih, ou, ee, oh} weights
   with a small decision surface. Cheap, robust, language-agnostic enough
   for vowels; consonants read as closures via energy dips.
2. Small ML (v2): a tiny CNN/GRU on log-mel frames (an openly licensed
   viseme model, or distill one) via ONNX Runtime Web (wasm EP; the model
   is tiny). Better consonants, ~2 ms/frame budget.

Ship (1) first; (2) behind the same interface.

## Fusion rule

Let a = audio openness [0,1], v = visual jawOpen, c_v = visual confidence
(tracking quality from KGM-015), VAD = speech probability.

- openness = VAD * max(a, v * c_v) + (1 - VAD) * v * c_v
- shape (aa/ih/ou/ee/oh ratios): visual when c_v high, audio ratios when
  low, linear blend on c_v.
- Attack fast, release slow (attack 30 ms, release 120 ms) so plosives
  register and mouths do not flap on noise.

Runs viewer-side or tracker-side; default tracker-side so the fused result
is what goes on the wire (KGM stays renderer-agnostic). Requires adding the
five viseme channels or reusing the existing mouth channels; decision:
reuse existing ARKit channels (jawOpen, mouthFunnel, mouthPucker,
mouthStretch*) so the protocol is unchanged.

## Privacy

Audio never leaves the device; only the derived mouth channels do. State
this explicitly in the UI the first time the mic is enabled.

## Risks

- AudioWorklet + getUserMedia permission flow adds UX friction: mic is
  strictly opt-in, tracker works without it.
- Keyboard/desk noise triggering VAD: energy gate + spectral flatness check.
