<!-- i18n: language-switcher -->
[English](asset-license-checklist.md) | [日本語](asset-license-checklist.ja.md)

# Asset License Checklist

Status: implemented checklist for issue #163. Related: #41.

Compression, retargeting, and screenshots count as modification or derivative
use under many creator-marketplace licenses. No sample asset is optimized or
published until its license clears this checklist. See the license section of
[avatar-compression.md](avatar-compression.md).

## Steps

1. For every bundled or sample asset, record:
   - source URL or author-provided package
   - license name and version
   - whether redistribution is allowed
   - whether modification/compression is allowed
   - whether attribution is required
   - whether model output or screenshots can be used in docs
2. Store the license record beside the asset, or in the release notes for
   external sample files.
3. Do not publish an optimized sample until redistribution **and** modification
   are both allowed.
4. Keep attribution text with the asset when required.

## Rig-breaking risks

- License terms are not a rig risk, but shipping a non-redistributable asset is
  a release blocker; treat a missing or ambiguous license as a hard stop, the
  same as a failed inspection.
- Screenshots in docs can violate an output clause even when the model file is
  never redistributed; check the output/screenshot terms separately.

## Test method

- The license fields are part of the sample-asset checklist
  (`shared/compression-checklist.js`); `evaluateAssetChecklist` fails an asset
  whose record is missing redistribution or modification permission.
- `pnpm test` covers the license gate in the checklist evaluator.
- Manual: confirm the license record exists and is attached to the release
  before publishing any bundled asset.
