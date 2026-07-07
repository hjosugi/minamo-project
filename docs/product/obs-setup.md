# OBS Setup

## Browser source

1. Start the tracker and connect to a room.
2. Open `viewer/?preset=obs&room=<room>&bg=transparent&hud=0&camera=locked`.
3. Load or drop a VRM file.
4. Add the viewer URL as an OBS Browser Source.

Recommended source settings:

- Width: 1920
- Height: 1080
- FPS: 60 when the machine can sustain it, otherwise 30
- Shutdown source when not visible: off for live avatar use
- Refresh browser when scene becomes active: off
- Custom CSS:

```css
body { background-color: rgba(0, 0, 0, 0); margin: 0; overflow: hidden; }
```

## Preset URLs

Use query parameters for repeatable scenes:

```text
viewer/?preset=obs&room=stage&bg=transparent&hud=0&camera=locked
viewer/?preset=obs&mode=ws&room=stage&token=<token>&bg=transparent&hud=0&camera=locked
viewer/?preset=obs&mode=wt&room=stage&token=<token>&wtUrl=https://localhost:4433&wtHash=<hex>&bg=transparent&hud=0&camera=locked
viewer/?preset=obs&room=stage&vrm=<cors-url-to-model.vrm>&bg=transparent&hud=0&camera=locked
viewer/?preset=obs&room=stage&bg=transparent&hud=0&camera=locked&drum=1
viewer/?room=stage&scene=anime&bg=solid&bgColor=%23151221&bloom=1&vignette=1&camera=locked
```

Room tokens are optional for local/private setups and required for shared
relays configured with `MINAMO_RELAY_TOKEN`.

`bg=transparent` makes the renderer clear to alpha and hides the floor. `hud=0`
removes every viewer control from the captured source. `camera=locked` keeps the
default front-facing framing stable across OBS refreshes.

## Scene presets

The viewer ships three live-switchable scene presets:

- `scene=soft`: neutral soft key light
- `scene=anime`: warmer key, strong colored rim, bloom, and vignette
- `scene=flat`: low-contrast flat lighting for PNG or heavily textured avatars

Use `bgColor=%23rrggbb`, `bloom=0|1`, and `vignette=0|1` to serialize the full
scene state. The viewer **Copy URL** button writes the current scene, transport,
room, background, post-FX, HUD, drum overlay, and camera state into one
reproducible URL. The tracker **Copy OBS overlay URL** button emits an OBS-ready
transparent URL with `drum=1` for the hand-derived drum overlay.
