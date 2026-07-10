# Avatar Visual Regression Checklist

Status: implemented checklist for issue #162. Related: #41.

Every optimized avatar must be compared against the original before it ships.
This is the acceptance gate referenced by the texture and geometry stages in
[avatar-compression.md](avatar-compression.md).

## Steps

1. Capture the original and optimized avatar from the same viewer URL.
2. For each pose below, save a full-frame image and a cropped face image:
   - neutral pose
   - blink left / blink right
   - mouth open, smile, pucker
   - look left / right / up / down
   - spring bone movement after a head turn
   - transparent OBS background
   - one low-end device load test
3. If a pixel-diff tool is used, mask the background and hair tips so spring
   motion does not hide facial or material regressions.
4. Record pass/fail per pose next to the asset.

## Rig-breaking risks

- A regression that only appears on a specific expression (e.g. pucker) is
  missed if the neutral pose is the only one checked; the full pose list is
  mandatory.
- Spring bone differences can mask facial regressions in a full-frame diff;
  always also diff the cropped face region.
- Transparent-mode edge artifacts are invisible on an opaque background; the OBS
  transparent capture is required.

## Test method

- The pose list is encoded in the sample-asset checklist
  (`shared/compression-checklist.js`) so `evaluateAssetChecklist` fails when a
  required pose is missing from an asset's regression record.
- `pnpm test` covers the checklist evaluator.
- Manual: complete the pose grid and attach the pass/fail record to the release
  notes for any bundled sample asset.
