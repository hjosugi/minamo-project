# DD-004: Inochi2D Render Backend (inox2d WASM)

Status: implemented (experimental). Backlog: KGM-038. Runtime issue: #229.

## Problem

The 2D VTuber ecosystem is dominated by a proprietary format (Live2D).
Inochi2D is the open alternative (puppet formats .inp/.inx), and inox2d is
its Rust renderer. Browsers are the one place it does not comfortably run
yet; Minamo wants a first-class open 2D path.

## Goals

- Load and render Inochi2D puppets in the viewer at 60 fps.
- Drive puppet parameters from KGM channels through the same mapping
  editor as VRM (KGM-044): one mapping model, two backends.

## Implemented approach

1. Compile the official inox2d WebGL2/glow renderer to wasm32 via
   wasm-bindgen. The source dependencies are pinned to upstream commit
   `df8413e6b0c525dbb880b4dca2bdf0a5d4b9aaba`; the glue and 580 KiB WASM
   artifact are checked in for offline Viewer/Tauri builds.
2. A thin JS wrapper matches `Inochi2DRuntimeAdapter` in
   `src/adapters/inochi2d_mapper.ts`: `load(bytes)`, `setParam(name, v)`,
   `update(dt)`, `render(target)`, `listParams()`, `dispose()`.
3. Parameter discovery parses only the length-prefixed JSON header shared by
   `.inp` and `.inx`; texture bytes are not decoded as JSON. Named parameters,
   vector shape, ranges, and defaults feed the existing expression mapping
   editor.
4. Inox2D renders into a hidden WebGL2 canvas with alpha and stencil. Three.js
   uploads that canvas through one `CanvasTexture` plane, leaving the existing
   Viewer renderer as the only visible swap chain. The source texture is
   refreshed before the final scene render each frame.
5. File input, drag/drop, and `?inochi=<cors-url>` choose this backend by
   `.inp`/`.inx` extension. Replacing the avatar or unloading the page frees
   the WASM object, disposes Three resources, loses the hidden GL context, and
   removes the hidden canvas.

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

The runtime applies fuzzy defaults only when a discovered parameter name
matches a known alias. Unmatched parameters remain visible and unmapped in the
editor. Export uses the same `minamo.expression-map.v1` format as VRM.

## Diagnostics and unsupported features

- Invalid magic, truncated JSON, malformed puppet data, missing WebGL2/stencil,
  and unsupported renderer features have separate user-facing diagnostics.
- The pinned upstream parser supports both `.inp` and `.inx`. It does not
  support BC7 puppet textures; users must re-export those textures as PNG or
  TGA.
- Inox2D describes its Rust renderer as experimental. Upstream feature gaps do
  not trigger a silent bot/VRM fallback.

## Risks

- Inox2D WASM maturity: the pinned source and generated artifact must be
  re-reviewed together when updating upstream.
- Two GL contexts remain necessary, but only the Three.js context presents to
  the screen. The Inox2D context is an internal texture producer.
- A redistributable real-puppet visual/latency matrix remains tracked by #230;
  #229 covers the runtime and browser lifecycle, not that separate evidence.
