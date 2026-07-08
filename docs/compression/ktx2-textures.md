# KTX2 Texture Compression Guide

Status: implemented design for issue #158. Related: #41.

KTX2/BasisU keeps textures compressed on the GPU, which cuts both download size
and VRAM. It is the texture stage of the pipeline in
[avatar-compression.md](avatar-compression.md).

## Steps

1. Inspect texture inventory first (`npm run inspect:glb -- avatar.glb`) and
   note texture count, dimensions, and material references.
2. Compress large albedo and normal maps to KTX2 (UASTC for normal/detail,
   ETC1S for large albedo where quality allows).
3. Keep uncompressed PNG/WebP fallbacks for tiny UI textures, sharp
   alpha-mask textures, and rigs whose authoring tools cannot preserve material
   references.
4. Record before/after GPU memory and first-frame load time next to the asset.
5. Verify the three.js `KTX2Loader` transcode target loads on the mobile
   browser tier before shipping.

## Rig-breaking risks

- Aggressive ETC1S on normal maps introduces face/clothing shimmer; use UASTC
  for normal maps.
- Block compression on alpha-cutout textures frays edges, visible in OBS
  transparent mode.
- If the encoder rewrites image slots, material references can point at the
  wrong texture; confirm material count and slot mapping against the baseline
  inspection.

## Test method

- Texture acceptance checklist (mirrored in `evaluateAssetChecklist`): albedo
  gradients preserved, normal maps free of shimmer, alpha edges clean in
  transparent mode, material references intact, mobile transcode target loads
  without fallback stalls.
- `npm test` covers the checklist evaluator gates for texture regressions.
- Manual: side-by-side viewer comparison at neutral, blink, and mouth-open
  poses ([visual-regression-checklist.md](visual-regression-checklist.md)).
