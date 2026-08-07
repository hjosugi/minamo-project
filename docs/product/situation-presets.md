<!-- i18n: language-switcher -->
[English](situation-presets.md) | [日本語](situation-presets.ja.md)

# Situation Presets

Status: implemented. Related: [obs-integration.md](obs-integration.md),
[default-avatar.md](default-avatar.md), [drummer-setup.md](drummer-setup.md).

> 日本語版: [situation-presets.ja.md](situation-presets.ja.md)

Minamo grew up around one situation. Drum performance had a setup panel, an
overlay, a benchmark harness and an OBS URL button, while a talk stream had
nothing but raw checkboxes. A situation is now first-class data: pick one, and
the tracker and viewer both reconfigure.

Definitions live in `shared/situation-presets.js`, keyed by
`minamo.situation-preset.v1`.

## The five situations

| id | Situation | Tracking | Viewer |
| --- | --- | --- | --- |
| `talk` | Just chatting | pose, face lock, audio lipsync; no hands; 720p/60; smooth | soft key, transparent |
| `game` | Game stream | face only; 480p/30; balanced | anime rim, no vignette, transparent |
| `sing` | Karaoke | pose + hands, standing; 720p/60; responsive | anime rim, bloom, transparent |
| `collab` | Collab | pose, no hands; 720p/30; balanced | soft key, transparent |
| `drum` | Drum performance | pose + hands + drummer mode; 720p/60; responsive | soft key, kit overlay, transparent |

Why each is shaped the way it is:

- **talk** turns hands *off* on purpose. In a seated bust-up shot the hands leave
  frame constantly, and an avatar whose hands keep appearing and vanishing reads
  worse than one with no hands at all.
- **game** is the low-budget preset: 480p at 30fps, face only, no pose or hand
  model loaded. The game gets the machine.
- **sing** uses `responsive` filtering. Smoothing that flatters a talk stream
  reads as lag when the mouth has to land on a beat.
- **collab** drops to 30fps and no hands because the cost is per participant.
- **drum** is the original behaviour, unchanged, now one situation among five.

## What a situation does and does not touch

Applied: pose, hands, audio lipsync, face lock, drummer mode, body mode,
resolution, fps, the face smoothing group, and the viewer's lighting preset,
transparency, arm solver, bloom, vignette and drum overlay.

Left alone: transport mode, room, token, camera device, calibration profiles,
privacy mode, per-group smoothing other than face, and the viewer background
colour. Those belong to the machine and the room, not to what the streamer is
doing today — a situation switch must not silently change where motion is going.

Switching situations reaches the running pipeline, not just the checkboxes: pose
and hand models are loaded on demand, audio lipsync starts or stops its mic
stream, and the camera restarts only when resolution or fps actually changed.

## Using it

Tracker: **Situation** in the setup panel. The drummer panel appears only for
`drum`; that panel being permanently on screen was the main reason the app read
as drum-only.

Viewer: the **situation** field, or `?situation=<id>` in the URL. Explicit
parameters still win, so `?situation=game&bloom=1` is a game preset with bloom
forced on. The viewer's **Copy URL** button writes the situation into the URL
along with the rest of the scene state.

## Schema

```js
{
  id: 'talk',
  labelKey: 'situation.talk.label',
  descriptionKey: 'situation.talk.description',
  tracking: { pose, hands, audioLipsync, faceLock, drummerMode, bodyMode, filterPreset, resolution, fps },
  viewer: { scenePreset, transparent, armSolver, drumOverlay, bloom, vignette },
  obs: { sceneNameKey, sources: [{ id, kind, owner, hintKey, bounds? }] },
}
```

Every `obs.sources` entry carries an `owner`. Only `owner: 'minamo'` sources are
ours to create; the rest are the handoff to OBS described in
[obs-integration.md](obs-integration.md).

## Testing

- `pnpm test` covers preset lookup and fallback, that each situation produces
  the documented tracker/viewer settings, that transport and camera settings
  survive a switch, and that `situationObsPlan` scales bounds onto a non-1080p
  canvas.
- Manual: switch situations while tracking and confirm the camera only restarts
  for `game` (the one resolution change), and that the drummer panel appears for
  `drum` alone.
