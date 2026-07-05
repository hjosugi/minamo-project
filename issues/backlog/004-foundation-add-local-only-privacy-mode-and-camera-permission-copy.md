---
title: "[Foundation] Add local-only privacy mode and camera permission copy"
labels: ["type/feature", "priority/P0", "area/privacy", "area/ui"]
milestone: "MVP-0"
---

# [Foundation] Add local-only privacy mode and camera permission copy

## Background

Build the KGM1 foundation that every later feature depends on.

## Acceptance criteria

- [ ] Data structures follow the spec
- [ ] Behavior can be verified via UI or tests
- [ ] Does not break the privacy default
- [ ] Reflected in README/QUICKSTART


## Implementation notes

- Implement as a small module
- Emit a warning on error
- Never store or transmit raw video


## Testing

- [ ] unit test
- [ ] manual browser test
- [ ] privacy mode smoke test


## Dependencies and related docs

- `docs/PROTOCOL_V2_DRAFT.md`
- `docs/ARCHITECTURE_TARGET.md`
- `docs/tracking/`

## Registration note

This file can be registered as a GitHub issue with `scripts/create_github_issues.py`.
