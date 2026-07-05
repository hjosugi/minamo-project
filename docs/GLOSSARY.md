# Glossary

- KGM1: Current compact binary motion packet used by the tracker and viewer.
- KGM2: Draft richer schema for hands, drums, quality, and future transports.
- Face block: Quaternion, head position, and 52 ARKit-style blendshape weights.
- Pose block: Compact upper-body landmark points sent with KGM1 frames.
- One Euro filter: Low-latency smoothing filter for human motion.
- Room: Relay namespace that connects one publisher to one or more subscribers.
- Room token: Optional shared secret required by relays before joining a room.
- Local mode: BroadcastChannel transport for same-browser tracker/viewer demos.
- WS mode: WebSocket relay transport for compatibility.
- WT mode: WebTransport datagram relay for newest-only low-latency delivery.
- JSONL recording: Local newline-delimited capture of decoded motion frames.
