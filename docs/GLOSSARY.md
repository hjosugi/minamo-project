# Glossary

## Protocol

- KGM1: Current compact realtime motion protocol used by the tracker and
  viewer.
- KGM1 JSON: Human-readable frame shape used by browser code, tests, and local
  recording.
- KGM1B: Compact binary packet for KGM1 frames. It starts with the `KGM1`
  magic bytes and is intended for low-latency transport.
- KGM2: Draft richer schema for hands, drums, quality, and future transports.
- Frame: One timestamped motion sample from a producer. Frames include a
  sequence number so receivers can reject stale or reordered packets.
- Keyframe: Reliable full-state frame that lets a receiver recover if it
  missed several realtime updates.
- Delta frame: Small newest-only update sent after a keyframe on transports
  that tolerate packet loss.

## Frame Blocks

- Face block: Quaternion, head position, and 52 ARKit-style blendshape weights.
- Pose block: Compact upper-body landmark points sent with KGM1 frames.
- Blendshape: Normalized expression channel, usually in the `[0, 1]` range.
- Head quaternion: Rotation for the tracked head in canonical KGM1 space.
- Canonical space: Normalized coordinate space used inside KGM1 before mapping
  to avatar-specific rigs.
- Quality score: Per-frame confidence value derived from tracking warnings,
  stale frames, and signal validity.

## Runtime Roles

- Tracker: Browser page that reads camera frames, runs local inference, and
  publishes KGM1 frames.
- Viewer: Browser page that receives KGM1 frames and drives a VRM or fallback
  avatar.
- Producer: Any process that emits KGM1 frames.
- Consumer: Any process that decodes KGM1 frames.
- Publisher: Producer connected to a relay room.
- Subscriber: Consumer connected to a relay room.
- Room: Relay namespace that connects one publisher to one or more subscribers.
- Room token: Optional shared secret required by relays before joining a room.

## Transport Modes

- Local mode: BroadcastChannel transport for same-browser tracker/viewer demos.
- WS mode: WebSocket relay transport for compatibility.
- WT mode: WebTransport datagram relay for newest-only low-latency delivery.
- Newest-only delivery: Realtime policy where old packets are dropped instead
  of queued, keeping avatar motion current.
- JSONL recording: Local newline-delimited capture of decoded motion frames.

## Stabilization

- One Euro filter: Low-latency smoothing filter for human motion.
- Hysteresis: Separate enter/exit thresholds that prevent rapid state flicker.
- Anatomy clamp: Constraint that keeps fingers, face, and avatar rig values
  inside physically plausible ranges.
- Occlusion state: Runtime state for partially missing landmarks, used to
  blend or freeze signals until tracking recovers.
- Reacquisition: Transition from lost or low-confidence landmarks back to a
  stable tracked state.

## Calibration

- Calibration profile: Local settings that store offsets, gains, dead zones,
  and mirror preferences for a creator or device.
- Mirror mode: Viewer/tracker option that swaps left and right signals when
  the camera or OBS setup requires it.
- Warning taxonomy: Structured set of tracking warnings, such as low light,
  fast motion, occlusion, glare, or stale frames.
