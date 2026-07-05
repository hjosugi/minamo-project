---
title: "[Transport] Add WebTransport receiver prototype"
labels: ["type/feature", "area/transport", "protocol/kgm1", "priority/P2"]
milestone: "MVP-3"
---

# [Transport] Add WebTransport receiver prototype

## Background

Deliver KGM1 motion frames with low latency and drive remote avatars without sending raw video.

## Acceptance criteria

- [ ] Does not break local-only mode
- [ ] A fallback exists
- [ ] A latency metric exists
- [ ] A security note exists


## Implementation notes

- Use WebTransport datagrams for motion deltas
- Use streams for keyframes and control messages


## Testing

- [ ] local loopback test
- [ ] packet drop simulation
- [ ] fallback test


## Dependencies and related docs

- `docs/PROTOCOL_V2_DRAFT.md`
- `docs/ARCHITECTURE_TARGET.md`
- `docs/tracking/`

## Registration note

This file can be registered as a GitHub issue with `scripts/create_github_issues.py`.
