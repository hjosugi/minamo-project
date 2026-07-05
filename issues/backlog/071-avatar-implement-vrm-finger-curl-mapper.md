---
title: "[Avatar] Implement VRM finger curl mapper"
labels: ["type/feature", "area/avatar", "priority/P1", "integration/avatar"]
milestone: "MVP-1"
---

# [Avatar] Implement VRM finger curl mapper

## Background

Safely connect stabilized KGM1 signals to avatar rigs such as VRM, Live2D, and Inochi2D.

## Acceptance criteria

- [ ] Target parameters are generated from KGM1Frame
- [ ] Does not exceed rig limits
- [ ] A debug view exists


## Implementation notes

- Absorb format differences in the adapter layer
- Use semantic state, not raw landmarks


## Testing

- [ ] mapping unit test
- [ ] manual avatar visual test


## Dependencies and related docs

- `docs/PROTOCOL_V2_DRAFT.md`
- `docs/ARCHITECTURE_TARGET.md`
- `docs/tracking/`

## Registration note

This file can be registered as a GitHub issue with `scripts/create_github_issues.py`.
