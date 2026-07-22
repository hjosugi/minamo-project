<!-- i18n: language-switcher -->
[English](gltf-transform.md) | [日本語](gltf-transform.ja.md)

# glTF Transform Optimization Guide

Status: implemented design for issue #157. Related: #41.

glTF Transform is the first optimizer in the pipeline because it inspects and
rewrites GLB predictably and preserves extension data better than ad-hoc tools.
See [avatar-compression.md](avatar-compression.md) for the full pipeline.

## Steps

1. Inspect first, always:

   ```bash
   gltf-transform inspect avatar.glb
   ```

2. Apply conservative, reversible passes one at a time, keeping every
   intermediate file:

   ```bash
   gltf-transform dedup avatar.glb avatar.dedup.glb
   gltf-transform prune avatar.dedup.glb avatar.pruned.glb
   ```

3. Re-run the repo inspector after each pass and diff the summary:

   ```bash
   pnpm inspect:glb -- avatar.pruned.glb --avatar
   ```

4. Only after the pruned file still loads in the viewer, move on to texture
   ([ktx2-textures.md](ktx2-textures.md)) and geometry
   ([meshopt-vs-draco.md](meshopt-vs-draco.md)) compression.

## Rig-breaking risks

- `prune` can remove nodes an artist left intentionally (helper bones, empty
  slots). Confirm humanoid and spring bone node counts are unchanged after
  pruning.
- `dedup` merging accessors is safe for geometry but must not collapse distinct
  morph targets; verify morph target count is unchanged.
- `weld` and `resample` are not part of the default conservative pass because
  they can alter animation and blendshape data; add them only with a visual
  regression pass ([visual-regression-checklist.md](visual-regression-checklist.md)).

## Test method

- `pnpm test` asserts the inspector summary fields the guide depends on
  (morph target count, humanoid names, expression names).
- The sample-asset checklist (`evaluateAssetChecklist`) gates each stage against
  the baseline summary and fails on any rig-critical regression.
- Manual: load `avatar.pruned.glb` in the viewer and confirm identical
  appearance before any lossy compression.
