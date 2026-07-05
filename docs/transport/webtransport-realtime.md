# WebTransport Realtime Design

Status: implemented prototype for browser sender/receiver transport,
WebSocket fallback, token/origin checks, and congestion policy.

## 1. Goal

Send avatar motion frames with low latency and without sending raw webcam video.

## 2. Channels

| Channel | Transport | Reliability | Payload |
|---|---|---|---|
| motion | WebTransport datagram | unreliable | KGM1 frame today, KGM2 delta frame in the compact profile |
| keyframe | WebTransport stream | reliable | full KGM1/KGM2 keyframe design |
| control | WebTransport stream | reliable | calibration, room state |
| debug | WebSocket | reliable | JSON logs |

The browser prototype in `shared/transport.js` sends and receives
WebTransport datagrams through `MinamoTransport`. The Rust relay prototype in
`relay-rs/src/main.rs` has a native pub/sub integration test that echoes
datagrams through a room.

## 3. Fallback

If WebTransport is unavailable:

1. WebSocket binary
2. WebSocket JSON (`{ "type": "kgm1", "payload": "<base64>" }`)
3. local-only mode

`MinamoTransport.connectAuto()` uses this order for `wt` requests and reports
the actual active mode in the tracker/viewer HUD. A requested `local` mode stays
local; it is never upgraded to a network transport. The fallback timeout is
3 seconds by default so a blocked UDP/WebTransport path downgrades quickly.

## 4. Congestion behavior

- drop old motion frames first
- send latest state, not queued stale state
- reduce hand landmark detail before face mouth/eye controls
- keep critical events such as drum hit events on reliable stream if needed

Runtime policy:

- WebTransport sends use a newest-only pending datagram slot. If a new frame
  arrives while a datagram write is in flight, the pending older frame is
  replaced.
- WebSocket sends are skipped when `bufferedAmount` exceeds 512 KiB, preventing
  stale motion from building a long reliable queue.
- `classifyCongestion()` returns `clear`, `congested`, or `severe`, with a
  `newestOnly` flag and a `reduceDetail` flag for future hand/body detail
  throttling.
- `NewestOnlyMailbox` is the reference primitive for slow subscribers: lag is
  capped at one retained frame, and stale frames are counted as replaced.

## 5. Metrics

The tracker and viewer HUDs show the actual active transport mode and a
best-effort latency metric. KGM1 timestamp latency is computed when clocks are
compatible; impossible skew is rejected instead of displaying misleading
numbers. Future multi-source rooms use `ClockOffsetEstimator` from
`shared/kgm2.js` to align sender clocks.

## 6. Security

- HTTPS only
- origin checks
- session token
- no raw video by default
- per-room permission
- rate limit KGM1 frames

`relay-node` checks optional room tokens in constant time and enforces
`MINAMO_ALLOWED_ORIGINS` when configured. `relay-rs` rejects wrong room tokens
before accepting the WebTransport session. The shared
`transportSecurityNote()` helper keeps the public security note explicit:
motion frames only, room tokens recommended/enabled, and raw camera video not
sent.
