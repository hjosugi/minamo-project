# DD-007: Recording and Replay (.kgm files)

Status: design. Backlog: KGM-047, KGM-048.

## Motivation

Three consumers of the same feature:
1. Users: record a take, replay it, export motion (VRMA).
2. Development: recorded sessions are deterministic regression fixtures for
   solver/codec/render changes.
3. KGM2 (DD-006): needs a corpus to validate compression claims.

## File format

Container, little-endian:

```
magic "KGMR" u32 | version u8 | flags u8 | reserved u16
meta_len u32 | meta JSON (utf-8): { created, tracker: {backend, versions},
                                    camera: {w, h, fps}, notes }
then repeated records:
  dt_ms u16 (delta since previous record) | len u16 | frame bytes (KGM1/2)
```

Frames are stored verbatim as they went on the wire, so replay exercises
the exact decode path. 60 fps face-only: 80 bytes/record -> ~4.6 MB per
10 minutes uncompressed; gzip (via CompressionStream on download) roughly
halves it.

## Tracker UI

Record / stop; live size counter; download via Blob. Recording taps the
encoded buffer right before transport.send, so transport state is
irrelevant.

## Viewer replay

Drop a .kgm file: a transport-like source replays records on their dt
schedule (with a speed control), feeding the same 'frame' event path.
Loop toggle. Scrub bar is v2 (needs a keyframe index; trivial once KGM2
keyframes exist).

## VRMA export (KGM-048)

Replay through the VRM application layer while sampling normalized bone
rotations and expression values at fixed dt, then serialize to VRM
Animation glTF. Runs in the viewer so the export reflects the active
mapping (KGM-044). Trim in/out points before export.

## Testing use

`fixtures/` gets one committed 30-second session. CI replays it through
decode -> solve -> mapping and asserts summary statistics (per-channel
mean/variance, final pose) within tolerance, catching regressions without
a camera.
