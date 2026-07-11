# Inochi2D runtime result

- Status: `PASS`
- Issue: `#229`
- Parent issue(s): `#221`
- Operator: Codex repository verification
- Date (UTC): `2026-07-11`
- Verification commit SHA: `1bbf737bc566bb45b00bc9c2f37cfb2e625f0a6e`
- Environment: [ENVIRONMENT.md](ENVIRONMENT.md)
- Commands: [COMMANDS.md](COMMANDS.md)

## Completed scope

- Official Inox2D WebGL2 is pinned to revision
  `df8413e6b0c525dbb880b4dca2bdf0a5d4b9aaba`, wrapped behind the six-method
  adapter contract, and bundled as local JS/WASM with recorded SHA-256 values.
- `.inp` and `.inx` share extension-based file input, drag/drop, and URL load
  paths. The parser validates the magic and bounded JSON header before WASM
  construction.
- Named parameter metadata feeds the live/exportable
  `minamo.expression-map.v1` editor. Head yaw/pitch/roll uses puppet ranges;
  blink and mouth defaults use conservative normalized-name aliases.
- Inox2D draws to a hidden alpha/stencil WebGL2 canvas. A Three.js
  `CanvasTexture` composites it through the existing final Viewer renderer.
- Avatar replacement, participant removal, initialization failure, render
  failure, and page unload have explicit diagnostics and disposal paths for
  the WASM object, Three resources, hidden GL context, and canvas.

## Verification result

- Parser, mapping, mocked WASM lifecycle, disposal idempotence, and diagnostic
  regression tests passed with all existing JS/TypeScript tests.
- Rust WASM formatting and clippy passed with warnings denied.
- Production build emitted a local 593,966-byte WASM asset and release smoke
  passed.
- Chrome loaded a licensed Aka-derived real rig/payload with 34 parameters,
  ran the production WebGL2/WASM render loop for seven seconds without an
  exception, and reported `Inochi2D 4/34 parameters` with status `open`.

## Scope boundary

Aka is CC BY 4.0 by seagetch. Neither the original nor locally derived puppet
is committed. This PASS establishes the runtime/browser lifecycle in #229. It
does not claim real-texture visual fidelity, sustained 60 fps, creator-facing
quality, or publishable screenshots; those remain PENDING in #230.
