# DD-005: Elixir Clustered Relay

Status: harness implemented. Backlog: KGM-032, relates to KGM-034.

## Problem

relay-rs handles one node well. Popular streamers need fan-out to thousands
of viewers across regions, node failures must not end the stream, and rooms
must be findable across nodes. This is a distribution problem, which is
BEAM's home turf.

## Goals

- Horizontal fan-out: publisher connects to the nearest edge node; frames
  reach subscribers on every node.
- Node loss only drops that node's local subscribers.
- KGM frames stay opaque binaries end to end.

## Topology

```
 tracker --wt--> edge node A ----+
                                  |  Phoenix.PubSub (pg) over dist-erlang
 viewer  <--wt-- edge node B <---+
 viewer  <--ws-- edge node C <---+
```

- One GenServer per room per node ("room agent") subscribes to the PubSub
  topic `room:<id>` and owns the local subscriber set.
- Publisher frames: edge receives datagram -> `PubSub.broadcast` with the
  binary. Local delivery on the same node bypasses PubSub.
- Backpressure: each subscriber process holds a 1-slot mailbox (newest
  frame wins), mirroring KGM-034 semantics. BEAM per-process mailboxes make
  this trivial: on send, drop the unsent previous frame.

## WebTransport termination

BEAM has no mature WebTransport server. Two options:

1. Rust sidecar (preferred): relay-rs gains a mode where it terminates
   wt/QUIC and speaks a trivial length-prefixed TCP or Unix-socket protocol
   to the local BEAM node. Clear ownership: Rust does packets, Elixir does
   distribution.
2. Rustler NIF embedding wtransport: tighter, but QUIC event loops inside
   the BEAM scheduler need dirty schedulers and careful lifetime work.

WebSocket subscribers terminate natively in Phoenix (Bandit) on the same
nodes, which also covers Safari.

## Sizing target

1 pub -> 5,000 subs over 3 nodes, p99 added relay latency < 30 ms with
76-byte frames at 60 fps (about 23 Mbit/s egress total; trivial bandwidth,
the work is syscalls and scheduling).

## Failure model

- Edge node dies: its clients reconnect via DNS/anycast to another node;
  room agents are per-node so no global state is lost.
- PubSub partition: rooms keep working within each partition; document
  split-brain behavior as acceptable for this data class.

## Milestones

1. Phoenix app: ws-only clustered relay + load test harness.
2. Rust sidecar protocol + wt edge on one node.
3. Multi-region deploy recipe (fly.io or plain VMs) + chaos test.

## Harness evidence

`services/erlang-router/load-test.mjs` models the room-agent topology with
3 nodes, 5,000 subscribers, one publisher, newest-only local subscriber
mailboxes, and node-loss isolation. It is run from `npm test` and fails if
p99 fan-out latency is >= 30 ms or if a failed node affects non-local
subscribers.

Latest local result: p99 1.07 ms, node loss limited to the failed node's
subscribers.
