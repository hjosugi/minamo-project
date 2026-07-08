# Avatar and Motion Compression

Focused per-stage guides:
[glb-inspection](glb-inspection.md) ·
[gltf-transform](gltf-transform.md) ·
[ktx2-textures](ktx2-textures.md) ·
[meshopt-vs-draco](meshopt-vs-draco.md) ·
[texture-atlas-2d](texture-atlas-2d.md) ·
[motion-delta-quantization](motion-delta-quantization.md) ·
[visual-regression-checklist](visual-regression-checklist.md) ·
[asset-license-checklist](asset-license-checklist.md).

## 1. Goals

2D/3D avatars must load quickly on cheap hardware.

## 2. 3D assets

Recommended GLB pipeline:

1. inspect asset
2. remove unused nodes
3. resample animations
4. compress textures to KTX2 where safe
5. meshopt or Draco for geometry, chosen per model
6. preserve skeleton and blendshape names
7. run visual regression

Do not blindly optimize rigged avatars. Some optimization steps can change node hierarchy or break blendshape mapping.

### GLB inspection checklist

Before changing an avatar, record:

- file size, texture count, texture dimensions, material count
- node count, mesh primitive count, vertex count, morph target count
- humanoid bone names and VRM extension version
- expression/blendshape names
- spring bone collider and joint counts
- animation clip names and durations, if present

Fail the inspection if a tool strips `VRMC_vrm`, `VRM`, morph targets, humanoid nodes, or spring bone extensions.

Use the built-in inspector for a dependency-free first pass:

```bash
npm run inspect:glb -- avatar.glb
npm run inspect:glb -- avatar.glb --json
npm run inspect:glb -- avatar.glb --avatar
```

`--avatar` exits non-zero when the file is missing VRM metadata, humanoid bone
mapping, morph targets, or expression names. It is meant as a preflight guard
before glTF Transform or artist tooling rewrites the file.

### glTF Transform guide

Use glTF Transform as the first optimizer because it can inspect and rewrite GLB files predictably:

```bash
gltf-transform inspect avatar.glb
gltf-transform dedup avatar.glb avatar.dedup.glb
gltf-transform prune avatar.dedup.glb avatar.pruned.glb
```

Only run texture and mesh compression after the pruned file still loads in the viewer.

### Meshopt vs Draco decision

| Choice | Use when | Avoid when |
|---|---|---|
| meshopt | realtime web viewer, animated avatars, good decode speed | asset pipeline cannot preserve extension ordering |
| Draco | static meshes, maximum geometry compression | morph-heavy avatars or slow mobile decode paths |

Default to meshopt for avatars. Use Draco only after visual regression confirms blendshapes and spring bones survive.

Recommended decision record:

- original and optimized file byte size
- first-frame viewer load time on a low-end device
- decode time in Chrome performance profile
- whether every expression in the inspector summary still exists
- whether spring bone joints and colliders match the original count

### KTX2 texture guide

KTX2/BasisU is appropriate for large albedo and normal textures. Keep uncompressed PNG/WebP fallbacks for:

- tiny UI textures
- textures with sharp alpha masks
- rigs where authoring tools cannot preserve material references

Record before/after GPU memory and first-frame load time.

Texture acceptance checklist:

- albedo maps preserve skin gradients without block artifacts
- normal maps do not introduce face or clothing shimmer
- alpha-cutout textures keep clean edges in OBS transparent mode
- material references still point at the intended image slots
- mobile browser loads the chosen transcode target without fallback stalls

## 3. 2D assets

- Keep texture-atlas manifests deterministic: stable layer name, slot, depth,
  original size, packed rectangle, and transform origin.
- Offer a power-of-two atlas option for older GPUs, but keep the source PNG/PSD
  layers exportable for debugging.
- Generate compressed texture variants only after verifying alpha edges.
- Lazy-load expression packs that are not active in the current preset.
- Keep rig parameter names stable across atlas rebuilds.

For layered PNG and PSD mode, atlas only static layers that share the same transform origin. Keep mouth/eye swap layers separate if atlas packing would make debugging harder.

## 4. Motion frames

KGM1 compression stages:

- quantize normalized values
- delta encode from keyframe
- omit low-confidence unused signals
- event-only packets for drum hits
- periodic reliable keyframes

Motion delta quantization policy:

- face expression weights: 8-bit normalized deltas from the last keyframe
- head rotation: shortest-path quaternion delta, 12-16 bits per component when binary
- hand curls/spreads: 8-bit normalized values after rig clamps
- drum hits: event packet only; do not stream idle drum state
- force a keyframe after reconnect, model change, or 2 seconds of continuous deltas

Quantization acceptance gates:

- neutral face round-trips with no visible mouth or blink drift
- gaze direction error stays below 3 degrees after delta decode
- hand curl error stays below one rig-visible step after clamp
- reconnect keyframe restores full state in one frame
- old deltas are dropped if they arrive after a newer keyframe

## 5. Quality tradeoffs

Face and mouth signals should usually receive higher priority than detailed landmarks. For remote streaming, send avatar-ready parameters first, raw landmarks second.

## 6. Visual regression checklist

Every optimized avatar must be checked against the original:

- neutral pose
- blink left/right
- mouth open, smile, pucker
- look left/right/up/down
- spring bone movement after a head turn
- transparent OBS background
- one low-end device load test

Capture the original and optimized avatar from the same viewer URL. For each
pose, compare a full-frame image and a cropped face image. If a pixel-diff tool
is used, mask the background and hair tips so spring motion does not hide facial
or material regressions.

## 7. Asset license checklist

For every bundled or sample asset, record:

- source URL or author-provided package
- license name and version
- whether redistribution is allowed
- whether modification/compression is allowed
- whether attribution is required
- whether model output or screenshots can be used in docs

Store the license record beside the asset or in the release notes for external
sample files. Compression, retargeting, and screenshots count as modification
or derivative use for many creator-marketplace licenses; do not publish an
optimized sample until redistribution and modification are both allowed.

## 8. kagami-pack CLI (KGM-041)

`kagami-pack` (`scripts/kagami-pack.mjs`) is the planner and reporter for the
hosted-avatar pipeline. It inspects a GLB/VRM, plans the conservative stage
order, emits the exact encoder commands, and renders the before/after table.

```bash
npm run pack:avatar -- avatar.glb            # meshopt + KTX2 plan
npm run pack:avatar -- avatar.glb --draco    # Draco geometry instead of meshopt
```

The planner (`planAvatarPack`) records rig-critical counts and warns before any
lossy step; the operator runs the emitted `gltf-transform` / `gltfpack` commands,
then re-inspects with `npm run inspect:glb -- <out> --avatar`. Report size and
GPU memory before/after with `formatSizeTable`:

| metric | before | after | delta |
| --- | --- | --- | --- |
| file size | 8.00 MB | 2.40 MB | -70.0% |
| gpu memory | 120 MB | 40 MB | -66.7% |

The numbers above are an illustrative target (typical VRM shrinks 60-80%); fill
in measured values per asset after a visual regression pass
([visual-regression-checklist.md](visual-regression-checklist.md)).
