# 2D Texture Atlas Compression Guide

Status: implemented design for issue #160. Related: #41, #38.

2D avatars (layered PNG/PSD, Inochi2D) pack layers into a texture atlas. This
guide keeps atlases deterministic and debuggable, complementing the 2D section
of [avatar-compression.md](avatar-compression.md). See also
[../product/layered-avatar.md](../product/layered-avatar.md).

## Steps

1. Emit a deterministic atlas manifest: stable layer name, slot, depth,
   original size, packed rectangle, and transform origin.
2. Atlas only static layers that share the same transform origin. Keep
   mouth/eye swap layers separate so debugging stays simple.
3. Offer a power-of-two atlas option for older GPUs, but keep the source
   PNG/PSD layers exportable.
4. Lazy-load expression packs that are not active in the current preset.
5. Generate compressed texture variants only after verifying alpha edges.
6. Keep rig parameter names stable across atlas rebuilds so mapping editors and
   presets keep working.

## Rig-breaking risks

- Repacking that changes a layer's transform origin shifts the deform pivot and
  breaks physics/mesh deforms.
- Atlasing swap layers (mouth/eye) together makes state switches bleed across
  frames.
- Renaming rig parameters across a rebuild invalidates saved mappings
  ([../product/expression-mapping.schema.json](../product/expression-mapping.schema.json)).

## Test method

- The layered-avatar manifest is schema-validated
  ([../product/layered-avatar.schema.json](../product/layered-avatar.schema.json))
  and covered by `npm test`.
- The sample-asset checklist (`evaluateAssetChecklist`) verifies parameter-name
  stability and alpha-edge acceptance for the 2D area.
- Manual: rebuild the atlas and confirm every preset still maps to the same
  parameter names, and alpha edges stay clean in OBS transparent mode.
