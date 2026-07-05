---
title: "[ML] Add privacy-preserving dataset capture UI"
labels: ["type:feature", "area:ml", "priority:P2"]
milestone: "MVP-4"
---

# [ML] Add privacy-preserving dataset capture UI

## Background

Reinforce stick, drum, low-light, and contact cases that MediaPipe alone cannot handle with edge ML.

## Acceptance criteria

- [ ] An adoption decision or implementation plan exists
- [ ] A browser fallback exists
- [ ] A privacy policy exists


## Implementation notes

- Build the adapter first
- Do not leak model dependencies into core
- Record hash and version


## Testing

- [ ] benchmark test
- [ ] capability fallback test


## Dependencies and related docs

- `docs/PROTOCOL_V2_DRAFT.md`
- `docs/ARCHITECTURE_TARGET.md`
- `docs/tracking/`

## Registration note

This file can be registered as a GitHub issue with `scripts/create_github_issues.py`.
