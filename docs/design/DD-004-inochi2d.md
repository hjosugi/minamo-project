# DD-004: Inochi2D Render Backend (inox2d WASM)

Status: design. Backlog: KGM-038.

## Problem

The 2D VTuber ecosystem is dominated by a proprietary format (Live2D).
Inochi2D is the open alternative (puppet formats .inp/.inx), and inox2d is
its Rust renderer. Browsers are the one place it does not comfortably run
yet; KAGAMI wants a first-class open 2D path.

## Goals

- Load and render Inochi2D puppets in the viewer at 60 fps.
- Drive puppet parameters from KGM channels through the same mapping
  editor as VRM (KGM-044): one mapping model, two backends.

## Approach

1. Compile inox2d with a WebGL2 (glow) or wgpu backend to wasm32 via
   wasm-bindgen. Verify upstream's current wasm story first; contribute
   fixes upstream rather than forking.
2. Thin JS wrapper: `Inox2dAvatar { load(bytes), setParam(name, v),
   update(dt), render() }` on an OffscreenCanvas layered into the viewer.
3. Parameter discovery: puppets expose named parameters (e.g. "Head:: Yaw",
   "Eye:: Blink"). Enumerate them at load and feed the mapping editor.

## Default mapping heuristics

| KGM source | Inochi2D parameter (name match, fuzzy) |
|---|---|
| head yaw / pitch / roll (from quat) | Head Yaw / Pitch / Roll |
| eyeBlinkLeft/Right | Eye L/R Blink |
| jawOpen | Mouth Open |
| mouthSmile avg | Mouth Smile |
| pose shoulder roll | Body Roll |

Fuzzy matching by normalized parameter names; anything unmatched appears
unmapped in the editor rather than guessing.

## Risks

- inox2d WASM maturity: if blocked, fallback plan is Inochi2D's own
  JS bindings if/when available, or scoping v1 to a puppet subset
  (mesh deforms without physics).
- Two GL contexts (three.js + inox2d): render inox2d to a texture and
  composite in three.js to keep one swap chain.
