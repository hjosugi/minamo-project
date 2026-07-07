# Avatar and Motion Compression

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

### KTX2 texture guide

KTX2/BasisU is appropriate for large albedo and normal textures. Keep uncompressed PNG/WebP fallbacks for:

- tiny UI textures
- textures with sharp alpha masks
- rigs where authoring tools cannot preserve material references

Record before/after GPU memory and first-frame load time.

## 3. 2D assets

- texture atlas
- power-of-two option
- compressed texture variants
- lazy load expression packs
- keep rig parameter names stable

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

## 7. Asset license checklist

For every bundled or sample asset, record:

- source URL or author-provided package
- license name and version
- whether redistribution is allowed
- whether modification/compression is allowed
- whether attribution is required
- whether model output or screenshots can be used in docs
