<!-- i18n: language-switcher -->
[English](meshopt-vs-draco.md) | [日本語](meshopt-vs-draco.ja.md)

# Meshopt vs Draco Decision Document

Status: implemented decision for issue #159. Related: #41.

Geometry compression is the last of the 3D asset stages in
[avatar-compression.md](avatar-compression.md). This document records the
default choice and how to override it per asset.

## Current compatibility (verified 2026-07-27)

- meshoptimizer 1.0 stabilized the existing library surface and added a draft
  `KHR_meshopt_compression` output mode to gltfpack. It can produce that mode
  with `-cz` or `-ce khr`; normal `-c` / `-cc` output remains
  `EXT_meshopt_compression`.
- The Khronos glTF registry still lists `EXT_meshopt_compression` as the
  ratified extension. `KHR_meshopt_compression` is a newer draft with a denser
  bitstream, not yet the portable default across the wider viewer ecosystem.
- Minamo pins three.js 0.185.1. Its `GLTFLoader` recognizes both `EXT` and
  `KHR` meshopt buffer views through the same `setMeshoptDecoder` integration,
  so Minamo can evaluate either format without changing its viewer loader.

Therefore Minamo continues to publish `EXT_meshopt_compression` by default.
`KHR_meshopt_compression` is an opt-in experiment until every intended consumer
(Minamo browser/Tauri, inspection tools, OBS/browser-source environment, and any
third-party viewer named in the release evidence) is verified against the
specific asset.

## Steps

1. Default to **meshopt** (`EXT_meshopt_compression`) for animated avatars: fast
   GPU-friendly decode and good ratios for rigged, morph-heavy meshes.
2. Optionally compare draft **KHR meshopt** with `gltfpack -cz` (or
   `-ce khr`) only when the complete target-viewer list is recorded and tested.
   Do not replace the portable `EXT` artifact silently.
3. Consider **Draco** only for static props or when meshopt cannot hit the size
   target, and only after visual regression confirms blendshapes and spring
   bones survive.
4. Record the decision inputs for the asset: extension name, gltfpack and
   decoder versions, original and optimized byte size,
   first-frame viewer load time on a low-end device, decode time from a Chrome
   performance profile, whether every expression from the inspector summary
   still exists, and whether spring bone joint/collider counts match.

| Choice | Use when | Avoid when |
|---|---|---|
| meshopt `EXT` | portable realtime web viewer, animated avatars, good decode speed | asset pipeline cannot preserve extension ordering |
| meshopt `KHR` draft | every named consumer is verified and the measured size win is worth the narrower compatibility | publishing a general-purpose avatar or relying on unverified third-party loaders |
| Draco | static meshes, maximum geometry compression | morph-heavy avatars or slow mobile decode paths |

## Encoder compatibility

meshoptimizer 1.0 changed the raw vertex encoder to emit bitstream version 1 by
default, while `EXT_meshopt_compression` vertex data requires version 0.
Production assets should therefore use gltfpack's extension-aware modes:

- `gltfpack -c` / `-cc` for the portable `EXT` artifact.
- `gltfpack -cz` / `-ce khr` for an explicitly tested `KHR` artifact.

Do not feed the raw `meshopt_encodeVertexBuffer` default into an `EXT` buffer
view. If a custom encoder is unavoidable, select the version required by the
chosen extension explicitly and keep its decoder version in the evidence.

## Rig-breaking risks

- Draco quantization of positions/normals can distort blendshape deltas; verify
  each expression still reads correctly after decode.
- Extension ordering matters: applying geometry compression before spring bone
  extensions are finalized can drop `VRMC_springBone` data.
- Over-quantized skin weights cause visible seam/limb popping on animation.

## Test method

- The checklist evaluator (`evaluateAssetChecklist`) fails the geometry stage if
  morph target count, expression names, or spring bone counts regress against
  the baseline inspection.
- `pnpm test` exercises the evaluator gates.
- Manual: run the visual regression pass
  ([visual-regression-checklist.md](visual-regression-checklist.md)) on the
  compressed file and record the decision table above.

## Sources

- [meshoptimizer v1.0 release notes](https://github.com/zeux/meshoptimizer/releases/tag/v1.0)
- [gltfpack extension and flag reference](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md)
- [Khronos glTF extension registry](https://github.com/KhronosGroup/glTF/blob/main/extensions/README.md)
- [Ratified `EXT_meshopt_compression` specification](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_meshopt_compression/README.md)
- [three.js r185 `GLTFLoader`](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/loaders/GLTFLoader.js)
