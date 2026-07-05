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

## 3. 2D assets

- texture atlas
- power-of-two option
- compressed texture variants
- lazy load expression packs
- keep rig parameter names stable

## 4. Motion frames

KGM1 compression stages:

- quantize normalized values
- delta encode from keyframe
- omit low-confidence unused signals
- event-only packets for drum hits
- periodic reliable keyframes

## 5. Quality tradeoffs

Face and mouth signals should usually receive higher priority than detailed landmarks. For remote streaming, send avatar-ready parameters first, raw landmarks second.
