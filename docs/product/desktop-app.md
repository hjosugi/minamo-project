# Minamo Studio Desktop App

Minamo Studio is the Tauri desktop shell for the existing tracker, viewer, and
replay tools.

## Commands

```sh
pnpm desktop:check
pnpm desktop:dev
pnpm desktop:build
```

`pnpm desktop:dev` opens the native control surface. Select **Open Avatar**,
choose an Inochi2D `.inp`/`.inx` or VRM `.vrm`/`.glb` file in the OS file
picker, and Minamo opens the Viewer and loads it immediately. A packaged build
is written under `src-tauri/target/release/bundle/` by default.

## Native Avatar Loading

The desktop shell keeps the selected canonical file path inside Rust and sends
only the name, format, byte length, and a process-local revision to the webview.
The Viewer requests the matching revision through a raw binary IPC response and
loads it from memory through the same reviewed avatar loaders used by file drop.

- The size limit is 256 MiB; empty, unsupported, and non-regular files fail
  before loading.
- Selection state lasts only for the current app process and is not persisted.
- The webview cannot submit an arbitrary path, and no broad filesystem or asset
  protocol scope is granted. Only the `main` and `viewer` windows receive the
  core IPC capability.
- Browser preview remains supported; use the Viewer file controls or drag and
  drop when the Tauri runtime is not attached.

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
