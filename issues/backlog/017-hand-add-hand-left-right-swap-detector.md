---
title: "[Hand] Add hand left/right swap detector"
labels: ["type:feature", "tracking:hand", "priority:P1", "area:tracking"]
milestone: "MVP-1"
---

# [Hand] Add hand left/right swap detector

## Background

Hand-tracking features for natural, per-finger tracking.

## Acceptance criteria

- [ ] Left and right hands are distinguished
- [ ] Per-finger values are populated into KGM1Frame
- [ ] Confidence values and warnings are provided
- [ ] Unnatural jumps are suppressed


## Implementation notes

- Never feed MediaPipe raw landmarks directly to the avatar
- Put derived state in src/core
- Verify with the UI debug overlay


## Testing

- [ ] unit test with synthetic landmarks
- [ ] manual webcam test
- [ ] occlusion test


## Dependencies and related docs

- `docs/PROTOCOL_V2_DRAFT.md`
- `docs/ARCHITECTURE_TARGET.md`
- `docs/tracking/`

## Registration note

This file can be registered as a GitHub issue with `scripts/create_github_issues.py`.
