---
title: "[Drum] Add hand assignment for drum hits"
labels: ["type/feature", "tracking/drum", "priority/P1", "area/tracking"]
milestone: "MVP-2"
---

# [Drum] Add hand assignment for drum hits

## Background

Track drum performance with a webcam and audio, converting hits, hit velocity, hands, and feet into KGM1 events.

## Acceptance criteria

- [ ] DrumHitEvent can be generated
- [ ] False-positive mitigation exists
- [ ] An audio-sync design exists
- [ ] A benchmark method exists


## Implementation notes

- Start with geometry-based hit detection
- Treat audio onsets as an auxiliary signal
- Persist zone calibration


## Testing

- [ ] single snare hit test
- [ ] alternating hand test
- [ ] false positive cooldown test


## Dependencies and related docs

- `docs/PROTOCOL_V2_DRAFT.md`
- `docs/ARCHITECTURE_TARGET.md`
- `docs/tracking/`

## Registration note

This file can be registered as a GitHub issue with `scripts/create_github_issues.py`.
