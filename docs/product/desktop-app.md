# Minamo Studio Desktop App

Minamo Studio is the Tauri desktop shell for the existing tracker, viewer, and
replay tools.

## Commands

```sh
npm run desktop:check
npm run desktop:dev
npm run desktop:build
```

## Bundled Pages

- `desktop/` opens the control surface.
- `tracker/` runs webcam tracking from bundled web assets.
- `viewer/` renders the avatar from bundled web assets.
- `replay/` publishes local KGM1 JSONL recordings from bundled web assets.

## Virtual Camera Backends

The desktop shell reports the platform backend state. Viewer-frame streaming
is intentionally behind the native backend boundary because each OS needs a
different signed driver or extension path.

| OS | Backend target | Current state |
|---|---|---|
| Linux | `v4l2loopback` | Driver and first `/dev/video*` detection in the desktop shell |
| Windows | Media Foundation softcam | Backend bridge not installed |
| macOS | CoreMediaIO camera extension | Extension not installed |

Ship criteria for the output backend:

- explicit user opt-in before writing frames
- visible device in one conferencing app per OS
- OBS Browser Source remains available as the no-driver fallback
- desktop status panel reports backend, device, and state

Keep issue KGM-050 open until viewer frames are visible as a virtual camera in one conferencing app on Linux, Windows, and macOS.
