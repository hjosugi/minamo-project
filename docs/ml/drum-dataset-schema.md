# YOLO Stick/Drum Training Data Schema

Status: implemented schema for issue #122. Related: full-body/stick ML roadmap
([model-roadmap-yolo-edge.md](model-roadmap-yolo-edge.md),
[dataset-labeling-guide.md](dataset-labeling-guide.md)).

A stick/drum detector (YOLO-family, run through ONNX Runtime Web) needs labelled
frames for stick tips, tails, and drum/cymbal zones. This schema keeps labels
consistent and privacy-preserving.

## Annotation schema

Per-frame annotations use the `minamo.drum-dataset.v1` schema, produced by
`createDrumDatasetAnnotation(frameId, labels, license)` in
[`src/core/drum.ts`](../../src/core/drum.ts). The machine-readable JSON Schema is
[../product/drum-dataset.schema.json](../product/drum-dataset.schema.json).

Each label is one of:

- `stick`: a stick with `points` (tip and optional tail) and `hand`
- `drumZone`: a kit/cymbal region with `zoneType` and polygon/ellipse `points`
- `hit`: a labelled hit with `zoneType`, `hand`, and `timeMs`

## YOLO export mapping

- Class ids: `stick-tip`, `stick`, and one class per `zoneType` (snare, hihat,
  ride, crash, tom, kick).
- Bounding boxes are derived from the label `points` (tight box around the tip
  for `stick-tip`, hull for zones).
- Keypoints (optional): stick tip and tail for a pose-style head.

## Privacy and licensing

- `consent.localOnly` defaults to `true`; raw video/audio never leaves the
  device by default.
- `consent.license` records the redistribution terms of any shared clip; default
  is `0BSD`.
- Contributors opt in explicitly before any frame is shared, matching the
  privacy-preserving dataset record in
  [../design/DD-002-fullbody-onnx.md](../design/DD-002-fullbody-onnx.md).

## Testing

- `pnpm test` covers `createDrumDatasetAnnotation` producing the
  `minamo.drum-dataset.v1` schema with local-only consent.
- The JSON Schema file is validated as part of the structure check.
