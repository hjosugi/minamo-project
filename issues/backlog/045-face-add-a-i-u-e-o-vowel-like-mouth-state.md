---
title: "[Face] Add A/I/U/E/O vowel-like mouth state"
labels: ["type:feature", "tracking:face", "priority:P0", "area:tracking"]
milestone: "MVP-0"
---

# [Face] Add A/I/U/E/O vowel-like mouth state

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
