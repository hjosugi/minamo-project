# MoQ Distribution Evaluation

Status: evaluated. Recommendation: no-go for Minamo production distribution
until MoQT interop and browser-facing relay deployments are stable enough to
test in CI.

Sources reviewed:

- IETF `draft-ietf-moq-transport-18`, May 2026:
  https://datatracker.ietf.org/doc/draft-ietf-moq-transport/
- IETF Media over QUIC working group charter:
  https://datatracker.ietf.org/group/moq/about/

## Mapping Design

MoQT is a publish/subscribe protocol over QUIC or WebTransport. It is media
agnostic and can carry timed metadata, so KGM frames fit the object model.

Proposed namespace:

```text
minamo/<room>/<source-id>
```

Tracks:

| Track | MoQ delivery | Minamo payload | Notes |
|---|---|---|---|
| `motion.delta` | object datagram | KGM2 delta frame | newest-only, expires quickly |
| `motion.keyframe` | subgroup/stream | KGM2 keyframe | reliable recovery point |
| `control` | stream | clock probes, profile changes | reliable, ordered |
| `events` | stream or datagram | drum hits, scene events | reliable only when event loss is unacceptable |

Groups map to KGM keyframe intervals. Delta objects reference the latest
keyframe group id. Subscribers join at the largest available keyframe group,
then receive `motion.delta` datagrams until the next keyframe.

## Latency Findings

No production code is switched to MoQ by this evaluation. Minamo's measured
baseline remains the WebTransport datagram relay in `relay-rs`; release smoke
runs a native pub/sub datagram echo test on every pass. For MoQ, the current
state is a protocol mapping and risk analysis rather than a CI-stable latency
benchmark.

Expected latency impact:

| Path | Expected behavior | Risk |
|---|---|---|
| Current `relay-rs` datagram | one room broadcast hop, newest-only subscriber drain | known local test path |
| MoQ direct relay | similar QUIC/WebTransport substrate plus MoQT object headers | small per-object overhead |
| MoQ CDN/relay mesh | scalable fan-out and caching semantics | extra relay scheduling, interop maturity unknown |

The MoQT draft defines object datagrams and notes that oversized datagram
objects can be dropped on paths with smaller datagram limits. That matches KGM2
delta semantics, but it requires MTU validation before production use.

## Go/No-Go

Decision: no-go for production in this repository today.

Reasons:

- Minamo already has a tested WebTransport relay path for low-latency rooms.
- MoQT is still an active Internet-Draft in 2026, so wire details can change.
- A public MoQ relay interop target is not part of release smoke yet.
- KGM2 still needs production transport rollout before adding another
  distribution layer.

Revisit when:

- a public MoQ relay can run in CI or a deterministic nightly lab
- Minamo can publish `motion.delta` and `motion.keyframe` tracks through that
  relay with p95 one-hop latency comparable to `relay-rs`
- E2EE metadata requirements are reconciled with MoQ relay caching metadata

Until then, keep MoQ as a distribution option for large fan-out research and
keep production rooms on Minamo's direct WebTransport/WebSocket relays.
