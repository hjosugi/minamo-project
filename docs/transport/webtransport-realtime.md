# WebTransport Realtime Design

## 1. Goal

Send avatar motion frames with low latency and without sending raw webcam video.

## 2. Channels

| Channel | Transport | Reliability | Payload |
|---|---|---|---|
| motion | WebTransport datagram | unreliable | KGM1 delta frame |
| keyframe | WebTransport stream | reliable | full KGM1 frame |
| control | WebTransport stream | reliable | calibration, room state |
| debug | WebSocket | reliable | JSON logs |

## 3. Fallback

If WebTransport is unavailable:

1. WebSocket binary
2. WebSocket JSON
3. local-only mode

## 4. Congestion behavior

- drop old motion frames first
- send latest state, not queued stale state
- reduce hand landmark detail before face mouth/eye controls
- keep critical events such as drum hit events on reliable stream if needed

## 5. Security

- HTTPS only
- origin checks
- session token
- no raw video by default
- per-room permission
- rate limit KGM1 frames
