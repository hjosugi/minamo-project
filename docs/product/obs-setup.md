# OBS Setup

## Browser source

1. Start the tracker and connect to a room.
2. Open `viewer/?room=<room>` and connect.
3. Load or drop a VRM file.
4. Enable Transparent in the viewer for an alpha background.
5. Add the viewer URL as an OBS browser source.

Recommended source settings:

- Width: 1920
- Height: 1080
- FPS: 60 when the machine can sustain it, otherwise 30
- Shutdown source when not visible: off for live avatar use
- Refresh browser when scene becomes active: off

## Preset URLs

Use query parameters for repeatable scenes:

```text
viewer/?room=stage&token=<token>&vrm=<cors-url-to-model.vrm>
```

Room tokens are optional for local/private setups and required for shared
relays configured with `MINAMO_RELAY_TOKEN`.
