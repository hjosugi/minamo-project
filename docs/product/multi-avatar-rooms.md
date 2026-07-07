# Multi-Avatar Rooms

Status: protocol and renderer design for issue #43.

## Goal

Allow several trackers to publish into the same room and several viewers to render the participants.

## Room Model

Each publisher has:

- `participantId`
- display name
- avatar URL or local avatar slot
- latest KGM frame
- quality state

The relay keeps newest-only motion delivery per participant. Reliable room metadata, such as join/leave and avatar slot changes, should use a control channel.

## Viewer Behavior

- Single participant keeps today's behavior.
- Multiple participants render in deterministic slots by `participantId`.
- A viewer can pin one participant for OBS.
- Late joiners receive latest metadata plus the next live motion frame; no video is retained.

## Wire Compatibility

KGM1 frames remain unchanged. Multi-avatar routing is envelope metadata around frames, not a new frame schema.

The implemented helper is `wrapKGM1FrameForRoom()` in `src/core/kgm1.ts`; viewers can use `latestFrameByParticipant()` for newest-only rendering.
