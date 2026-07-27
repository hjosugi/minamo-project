<!-- i18n: language-switcher -->
[English](README.md) | [日本語](README.ja.md)

# Clustered Relay Topology Model

This directory preserves the DD-005 topology model for a possible future
BEAM-based clustered relay. It contains no Erlang runtime or buildable OTP
application. The earlier unbuildable `src/kgm1_router.erl` sketch was archived
in #258 because nothing compiled, ran, or depended on it.

The production WebTransport edge remains `relay-rs`. A future implementation
of DD-005 would own:

- room/session supervision
- KGM1 stream fanout
- participant presence
- backpressure
- WebTransport/WebSocket gateway supervision
- metrics

The MVP can run fully in the browser. DD-005 remains a design record for future
remote-collaboration and production-scaling work.

## Topology simulation

> **This runs no Erlang.** It is a JavaScript model of the DD-005 design. A
> passing run is evidence about the *design*, not about a working clustered
> relay (#258).

Run from the repository root:

```sh
node services/erlang-router/topology-simulation.mjs
```

The committed simulation models the DD-005 topology: 3 nodes, 5,000 subscribers,
one publisher, newest-only local subscriber mailboxes, and node-loss isolation.
It fails if p99 relay fan-out latency is >= 30 ms or if a failed node affects
non-local subscribers.

Latest local result:

```json
{
  "nodes": 3,
  "subscribers": 5000,
  "frames": 180,
  "p99Ms": 1.07,
  "targetP99Ms": 30,
  "pass": true,
  "localOnlyDrop": true
}
```
