---
title: "[Compression] Add meshopt vs Draco decision document"
labels: ["type:docs", "area:compression", "priority:P2"]
milestone: "MVP-3"
---

# [Compression] Add meshopt vs Draco decision document

## Background

Compression design for fast avatar loading and low-bandwidth streaming even on cheap setups.

## Acceptance criteria

- [ ] Steps are documented
- [ ] Rig-breaking risks are documented
- [ ] A test method exists


## Implementation notes

- Be conservative with automatic optimization
- Respect skeleton/blendshape naming


## Testing

- [ ] sample asset checklist test


## Dependencies and related docs

- `docs/PROTOCOL_V2_DRAFT.md`
- `docs/ARCHITECTURE_TARGET.md`
- `docs/tracking/`

## Registration note

This file can be registered as a GitHub issue with `scripts/create_github_issues.py`.
