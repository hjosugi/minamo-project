---
title: "[Stability] Add stability regression benchmark report"
labels: ["type/feature", "tracking/stability", "priority/P1", "area/quality"]
milestone: "MVP-1"
---

# [Stability] Add stability regression benchmark report

## Background

Stabilization features that prevent jitter, broken joints, unnatural inversion, and teleporting.

## Acceptance criteria

- [ ] Raw and stabilized values can be compared
- [ ] Warnings are emitted
- [ ] No unsafe values reach the avatar
- [ ] Tests exist


## Implementation notes

- Use separate filter presets per signal type
- Fade toward neutral when confidence is low
- Fall back safely to the previous frame on breakage


## Testing

- [ ] synthetic spike test
- [ ] NaN test
- [ ] manual jitter test


## Dependencies and related docs

- `docs/PROTOCOL_V2_DRAFT.md`
- `docs/ARCHITECTURE_TARGET.md`
- `docs/tracking/`

## Registration note

This file can be registered as a GitHub issue with `scripts/create_github_issues.py`.
