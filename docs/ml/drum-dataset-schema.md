<!-- i18n: language-switcher -->
[English](drum-dataset-schema.md) | [日本語](drum-dataset-schema.ja.md)

# YOLO Stick/Drum Training Data Schema

Status: implemented and runtime-validated for issue #122. Related:
[model-roadmap-yolo-edge.md](model-roadmap-yolo-edge.md) and
[dataset-labeling-guide.md](dataset-labeling-guide.md).

A stick/drum detector needs reviewed geometric labels for stick tips, tails,
drum/cymbal outlines, and hit contact points. `minamo.drum-dataset.v1` is the
strict per-frame annotation contract for those labels. Its machine-readable
JSON Schema is
[../product/drum-dataset.schema.json](../product/drum-dataset.schema.json).

## Annotation kinds

Every label is exactly one of the following shapes. Fields from another kind
are rejected rather than silently ignored.

| `kind` | Required fields | Point count |
|---|---|---:|
| `stick` | `id`, `points`, `hand` | one tip plus an optional tail (1–2) |
| `drumZone` | `id`, `points`, `zoneType` | outline polygon (at least 3) |
| `hit` | `id`, `points`, `zoneType`, `timeMs`; optional `hand` | one contact point |

`hand` is optional on a hit because kick and other foot-triggered events do not
have a left/right hand. It is required on a stick label. `timeMs` is relative
to the source clip or capture session and must be non-negative.

Points use normalized source-frame coordinates: `x` and `y` are both in
`[0, 1]`; `z` is finite and may be negative. YOLO export ignores `z` for boxes,
but retaining it lets pose-style exporters use a tip/tail depth estimate.
An empty `labels` array is valid for a reviewed negative frame.

Trainable `zoneType` values cover the drum kit and supported hand-percussion
kits. Transport-only `unknown` and the non-impact pedal state are deliberately
excluded from detector classes.

## Runtime API

[`shared/drum-dataset.js`](../../shared/drum-dataset.js) is the production
consumer for browser and Node tooling:

- `validateDrumDatasetAnnotation(value)` returns all validation errors.
- `parseDrumDatasetAnnotation(jsonOrValue)` rejects malformed or invalid input.
- `createDrumDatasetAnnotation(...)` validates data before returning it.
- `createDrumDatasetAnnotationFromTrackerSample(sample, labels)` carries a
  tracker sample's frame identity, license, and local-only consent into a
  reviewed annotation.

[`src/core/drum.ts`](../../src/core/drum.ts) re-exports the typed positional
`createDrumDatasetAnnotation(frameId, labels, license)` API from that same
runtime implementation; there is no parallel validator to drift.

## Tracker export boundary

The tracker downloads `minamo.dataset.tracker-sample.v1` NDJSON. That format is
a privacy-preserving **capture envelope** containing landmarks, calibrated
zones, quality, and a coarse selector such as `label: "drum-hit"`. It does not
contain a reviewed stick tip/tail, contact point, hit timestamp, or hand for
each geometric object, so it is not automatically valid YOLO ground truth.

After a human or labeling tool supplies explicit geometric labels, call
`createDrumDatasetAnnotationFromTrackerSample`. The bridge never guesses labels
from the coarse selector. This makes the two schemas complementary instead of
two contradictory export formats.

## YOLO export mapping

- Class ids: `stick-tip`, `stick`, and one class per trainable `zoneType`.
- Bounding boxes come from the label points: a tight box around a tip/tail for
  sticks and the polygon bounds for a drum zone.
- Optional pose keypoints are the stick tip and tail.
- `hit` labels supply timing/zone evaluation targets; they are not object boxes.

## Privacy and licensing

- `consent.localOnly` records whether the annotation must stay local.
- `consent.license` is required and is copied from a tracker sample by the
  bridge; the creator defaults new local annotations to `0BSD`.
- Raw video/audio is outside both annotation JSON and the default tracker
  export. Sharing media still requires explicit participant consent and license
  review.

## Testing

- `pnpm test` covers valid labels, reviewed negative frames, every per-kind
  rejection, unexpected fields, malformed JSON, and the tracker-sample bridge.
- `pnpm typecheck` pins the discriminated TypeScript label union.
- `pnpm verify` checks the JSON Schema's `oneOf` definitions, required fields,
  coordinate bounds, and runtime exports.
