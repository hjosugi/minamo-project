# Phone-as-Tracker Mode

Status: design plus URL contract for issue #51.

## Goal

Use a phone browser as a tracker camera while the desktop viewer or OBS source runs elsewhere.

## URL Contract

The desktop app or landing page can generate a QR code for:

```text
/tracker/?mode=ws&room=<room>&token=<token>&camera=user
```

Optional parameters:

- `wtUrl` and `wtHash` for WebTransport rooms
- `resolution=720p|1080p`
- `fps=30|60`
- `mirror=0|1`

## Requirements

- HTTPS on LAN, using the setup in `docs/DEV_HTTPS.md`.
- No video upload. The phone publishes only KGM motion frames.
- Room token required outside local mode.
- Viewer URL can be copied independently, so the phone never needs OBS access.

## Implementation Notes

The existing tracker is already browser-only and responsive enough for phone capture. The missing production polish is a QR generator in the desktop shell and an explicit mobile layout pass for small screens.

