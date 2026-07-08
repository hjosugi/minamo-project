# Meshopt vs Draco Decision Document

Status: implemented decision for issue #159. Related: #41.

Geometry compression is the last of the 3D asset stages in
[avatar-compression.md](avatar-compression.md). This document records the
default choice and how to override it per asset.

## Steps

1. Default to **meshopt** (`EXT_meshopt_compression`) for animated avatars: fast
   GPU-friendly decode and good ratios for rigged, morph-heavy meshes.
2. Consider **Draco** only for static props or when meshopt cannot hit the size
   target, and only after visual regression confirms blendshapes and spring
   bones survive.
3. Record the decision inputs for the asset: original and optimized byte size,
   first-frame viewer load time on a low-end device, decode time from a Chrome
   performance profile, whether every expression from the inspector summary
   still exists, and whether spring bone joint/collider counts match.

| Choice | Use when | Avoid when |
|---|---|---|
| meshopt | realtime web viewer, animated avatars, good decode speed | asset pipeline cannot preserve extension ordering |
| Draco | static meshes, maximum geometry compression | morph-heavy avatars or slow mobile decode paths |

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
- `npm test` exercises the evaluator gates.
- Manual: run the visual regression pass
  ([visual-regression-checklist.md](visual-regression-checklist.md)) on the
  compressed file and record the decision table above.
