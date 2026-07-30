<!-- i18n: language-switcher -->
[English](webgpu-renderer-migration.md) | [日本語](webgpu-renderer-migration.ja.md)

# Research: three.js WebGPURenderer + MToonNodeMaterial Migration

Status: research pass for issue #276, with the migration surface measured
against the installed packages. Related: #223, #224,
[../DEPENDENCY_POLICY.md](../DEPENDENCY_POLICY.md).

## Goal

Decide whether the viewer should move from `WebGLRenderer` to
`WebGPURenderer` + `MToonNodeMaterial`, and establish what the move actually
costs before anyone starts it.

## Acceptance criteria

- [x] The goal is clear.
- [x] Acceptance criteria are clear.
- [x] Does not contradict the existing design: no renderer change is made here;
  WebGL stays the default.
- [x] Capability of the *pinned* versions verified against `node_modules`, not
  release notes.
- [x] Migration surface enumerated from `viewer/viewer.js`.
- [x] Version-pairing rule documented, as #276 asks "either way".
- [ ] Prototype behind `?renderer=webgpu`. **Not done** — see "Sequencing".
- [ ] Visual regression on the 13-pose grid, and fps/GPU-memory on low-end
  hardware. **Not done** — asset- and hardware-gated, same gates as #224.

## Findings

### The pinned versions are already capable — no upgrade is needed

Verified in `node_modules` rather than from release notes:

- `three@0.185.1` ships `build/three.webgpu.js` (and `three.webgpu.nodes.js`,
  `three.tsl.js`), so `WebGPURenderer` is available from the pinned version.
- `@pixiv/three-vrm@3.5.5` exports `./nodes`, and `lib/nodes/index.module.js`
  contains `MToonNodeMaterial`. Its `peerDependencies` are `three: >=0.137`.

Worth stating because it is easy to assume otherwise: **`MToonNodeMaterial` is
not in the package's main entry.** A search of `@pixiv/three-vrm` that only looks
at the top-level build finds nothing, which reads as "unsupported". It lives
behind the `@pixiv/three-vrm/nodes` subexport. This pass initially drew the wrong
conclusion from exactly that.

So #276's premise holds and no version bump is required. The pairing rule it asks
to record still matters for *future* bumps and is now written into
[../DEPENDENCY_POLICY.md](../DEPENDENCY_POLICY.md).

### The migration surface is three items, and the material is the smallest

Enumerated from `viewer/viewer.js`:

1. **Renderer construction and async init.** `new THREE.WebGLRenderer({antialias,
   alpha})` becomes `WebGPURenderer` imported from `three/webgpu`, and
   **`WebGPURenderer` initialises asynchronously**. Today the renderer is built
   at module scope (`viewer.js:158`) and used immediately on the next lines —
   `container.appendChild(renderer.domElement)` and
   `createVrmLoader(renderer)`.
2. **Post-processing.** `EffectComposer` + `RenderPass` + `UnrealBloomPass` from
   `three/addons/postprocessing/*` is the WebGL stack; WebGPU uses the
   node/TSL `PostProcessing` path with a bloom node instead. **This is the bulk
   of the work.**
3. **Material wiring.** `viewer/avatar-loader.js` registers
   `VRMLoaderPlugin(parser)` and takes the renderer (typed
   `import('three').WebGLRenderer`). The node path needs the MToon node material
   selected through the plugin; the exact option must be confirmed against the
   `./nodes` export rather than assumed.

#276 leads with `MToonNodeMaterial`, but that is item 3 and the narrowest of the
three — the loader plugin already abstracts material construction. The
post-processing chain is where the actual porting effort is.

### The regression surface is smaller than #276 assumes

#276 lists "MToon outlines, transparency/OBS alpha, bloom/vignette" for visual
regression. **The vignette is a DOM element** (`$('sceneVignette')` in
`viewer.js:196`), not a shader pass — it is CSS over the canvas and is entirely
renderer-agnostic. Bloom is the only GPU post-processing effect in the viewer.

That leaves three things genuinely at risk: MToon outlines (node material),
`alpha: true` transparency for OBS capture, and bloom. Three, not four, and one
of them is a single pass.

### The real risk is async init at module scope, in a file with form

`WebGPURenderer.init()` is async, so the renderer is not usable on the line after
construction. In `viewer.js` the renderer is constructed at module scope and
consumed immediately, so a migration must restructure module-load ordering.

This repo has already shipped a bug of exactly that shape: `landing/app.js`
shipped a temporal-dead-zone `ReferenceError` in v0.1.11/v0.1.12 (fixed in #302),
which is why `tests/helpers/dom-stub.mjs` exists to load the page entry modules
for real and prove they do not throw at module scope. A WebGPU migration walks
straight back into that class of bug, and the dom-stub test is the thing most
likely to catch it — so the prototype should keep the viewer loadable under the
stub, not only in a browser.

## Decision

**Hold WebGL as the default. The prototype behind `?renderer=webgpu` is the right
next step, but sequence it after #223.**

Reasons:

1. **Sequencing.** #223 wires KTX2, Meshopt and Draco decoders into the viewer.
   Those attach to the renderer and the GLTF loader — the same two objects a
   WebGPU migration replaces. Doing both concurrently means debugging two
   simultaneous changes to the same seam. #223 first, then the renderer.
2. **The default cannot flip without the evidence #224 owns.** Flipping needs the
   13-pose visual regression, and that needs a licensed VRM plus a real GPU. Both
   are gated exactly as #224 already records, so the default is not a decision
   this pass can make.
3. **Nothing is expiring.** WebGLRenderer is in maintenance mode, not removed,
   and `WebGPURenderer` carries a WebGL2 fallback — so a later migration is no
   more expensive than an earlier one, and it lands after the decoder work rather
   than tangled with it.

The stated benefit — freeing GPU headroom for the ONNX WebGPU pose backend
(#222) — is real but currently unreachable: #222 is itself blocked on the
`onnxruntime-web` supply-chain review, so there is no ONNX backend to contend
with the renderer for the GPU yet. That argument becomes live when #222 does.

## Sequencing

1. #223 — decoders (independent of renderer choice)
2. `?renderer=webgpu` prototype, kept loadable under `tests/helpers/dom-stub.mjs`
3. #224's 13-pose regression, once a licensed VRM exists
4. Default flip decision, on that evidence

## Sources

- Installed `three@0.185.1` (`build/three.webgpu.js`) and
  `@pixiv/three-vrm@3.5.5` (`lib/nodes/index.module.js`, `./nodes` export)
- three.js WebGPURenderer — <https://threejs.org/docs/pages/WebGPURenderer.html>
- @pixiv/three-vrm — <https://github.com/pixiv/three-vrm>
