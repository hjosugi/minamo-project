# GLB Inspection Script Design

Status: implemented design for issue #156. Related: #41.

Inspection is the first stage of the avatar compression pipeline
([avatar-compression.md](avatar-compression.md)). Nothing is rewritten until an
avatar has been inspected and its rig-critical structure recorded.

## Steps

1. Run the dependency-free inspector as a preflight:

   ```bash
   npm run inspect:glb -- avatar.glb
   npm run inspect:glb -- avatar.glb --json
   npm run inspect:glb -- avatar.glb --avatar
   ```

2. Record a baseline summary for every avatar before optimization:
   file size, texture count and dimensions, material count, node count, mesh
   primitive count, vertex count, morph target count, humanoid bone names, VRM
   extension version, expression/blendshape names, spring bone collider/joint
   counts, and animation clip names and durations.
3. Store the baseline JSON next to the source asset so a later pass can diff
   against it.
4. Re-inspect after every optimizer stage and compare the summary field by
   field. The counts that must never silently change are morph targets,
   humanoid nodes, spring bone joints, and expression names.

The parser and summary helpers are exported from
[`scripts/inspect-glb.mjs`](../../scripts/inspect-glb.mjs) (`parseGlb`,
`summarizeGltf`, `formatInspection`) so the same logic backs the CLI, the tests,
and the checklist evaluator.

## Rig-breaking risks

- `--avatar` mode exits non-zero when the file is missing VRM metadata,
  humanoid bone mapping, morph targets, or expression names. Treat a non-zero
  exit as a hard stop, not a warning.
- A tool that strips `VRMC_vrm`, `VRM`, morph targets, humanoid nodes, or spring
  bone extensions fails inspection even if the mesh still renders.
- Renamed humanoid bones or expressions break retargeting and mapping editors
  downstream; name changes count as breakage even when counts match.

## Test method

- `npm test` exercises `parseGlb`/`summarizeGltf` against a synthetic GLB and
  asserts the summary fields used by the checklist.
- The sample-asset checklist (`shared/compression-checklist.js`,
  `evaluateAssetChecklist`) runs the recorded inspection summary through the
  rig-preservation gates and fails when a rig-critical count drops to zero.
- Manual: open the original and inspected asset in the viewer and confirm the
  reported expression and bone names still drive the avatar.
