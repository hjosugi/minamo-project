# Phone-as-Tracker Mode

Status: QR/token runtime implemented for #226; secure WSS negotiation (#227)
and real-iPhone timing evidence (#228) remain pending.

## Goal

Use a phone browser as a tracker camera while the desktop viewer or OBS source runs elsewhere.

## URL Contract

The desktop app or landing page can generate a QR code for:

```text
/tracker/?mode=ws&room=<room>&token=<token>&wsUrl=<relay>&camera=user
```

Optional parameters:

- `wsUrl` for the WebSocket relay selected by the desktop pairing surface
- `wtUrl` and `wtHash` for WebTransport rooms
- `resolution=480p|720p|1080p`
- `fps=30|60`
- `mirror=0|1`
- `camera=user|environment` for the front/back camera preference

The tracker applies these values before rendering its controls. It removes the
token from the visible address bar after parsing it, does not persist a QR token
to local storage, and renders the in-page token input as a password field. The
viewer follows the same `room`, `token`, and `wsUrl` contract.

## Desktop pairing flow

1. Start `relay-node` and open Minamo Studio.
2. In **Pair a tracker**, set a tracker URL that the phone can reach. Use an
   HTTPS LAN hostname/address for a real phone; `localhost` means the phone
   itself and will not reach the desktop.
3. Set the matching `ws://` or `wss://` relay URL, room, front/back camera,
   resolution, frame rate, and token lifetime.
4. Generate and scan the QR. The tracker URL and viewer URL can also be copied
   independently. Visible fallback text is token-redacted; clipboard values
   contain the live token.
5. Use **Regenerate QR** to atomically invalidate the previous token and issue a
   replacement, or **Expire now** to reject future joins immediately.

The default token lifetime is five minutes (allowed range: 30 seconds to 15
minutes). `relay-node` keeps issued tokens in memory, binds each token to one
room, rejects expired/revoked tokens with WebSocket code `4401`, and sends
`Cache-Control: no-store` on token API responses. Existing
`MINAMO_RELAY_TOKEN` deployments remain supported.

## Requirements

- HTTPS on LAN, using the setup in `docs/DEV_HTTPS.md`.
- No video upload. The phone publishes only KGM motion frames.
- Room token required outside local mode.
- Viewer URL can be copied independently, so the phone never needs OBS access.
- Pairing QR screenshots and diagnostics must redact the QR/token before being
  attached to an issue. The relay never writes token values to its normal logs.

## Implementation Notes

The existing tracker remains browser-only. QR generation uses the pinned
`qrcode` package in the Vite/Tauri desktop bundle. The relay only issues room
credentials and transports KGM motion frames; no raw-video URL or upload route
is introduced.
