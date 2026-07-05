---
title: "[Face] Add audio-assisted mouth smoothing option"
labels: ["type/feature", "tracking/face", "priority/P1", "area/tracking"]
milestone: "MVP-1"
---

# [Face] Add audio-assisted mouth smoothing option

## Background

Capture eye and mouth motion accurately to raise avatar expression quality.

## Acceptance criteria

- [ ] Values are populated into FaceState
- [ ] Left and right eyes are handled independently
- [ ] Mouth shapes are stable
- [ ] Does not break under low confidence


## Implementation notes

- Keep raw blendshape values available
- Also compute semantic controls
- Compensate for false detections caused by head pose


## Testing

- [ ] manual face test
- [ ] blink test
- [ ] mouth neutral flicker test


## Dependencies and related docs

- `docs/PROTOCOL_V2_DRAFT.md`
- `docs/ARCHITECTURE_TARGET.md`
- `docs/tracking/`

## Registration note

This file can be registered as a GitHub issue with `scripts/create_github_issues.py`.
