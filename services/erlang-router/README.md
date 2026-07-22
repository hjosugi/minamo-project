<!-- i18n: language-switcher -->
[English](README.md) | [日本語](README.ja.md)

# Erlang Router Service

This is the OTP-side design and load-harness area for the future clustered
relay. The production WebTransport edge remains `relay-rs`; this service owns
room/session fan-out semantics for large rooms.

Responsibilities:

- room/session supervision
- KGM1 stream fanout
- participant presence
- backpressure
- WebTransport/WebSocket gateway supervision
- metrics

The MVP can run fully in the browser. This service is for remote collaboration
and production scaling.

## Load Harness

Run from the repository root:

```sh
node services/erlang-router/load-test.mjs
```

The committed harness models the DD-005 topology: 3 nodes, 5,000 subscribers,
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
