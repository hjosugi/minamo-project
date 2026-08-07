<!-- i18n: language-switcher -->
[English](obs-integration.md) | [日本語](obs-integration.ja.md)

# OBS Integration

Status: implemented. Related: [obs-setup.md](obs-setup.md),
[situation-presets.md](situation-presets.md),
[drum-obs-overlay.md](drum-obs-overlay.md).

> 日本語版: [obs-integration.ja.md](obs-integration.ja.md)

## The division of labour

OBS is already a compositor, a mixer, a recorder and a streaming client, and it
is better at all four than a WebGL canvas will ever be. So Minamo does not grow
its own backgrounds, layouts, transitions, alert overlays or recording. It
renders an avatar to a transparent page and hands the rest to OBS.

That split is not a convention someone has to remember — it is data. Every source
in a situation carries an `owner`:

| Owner | Sources | Who creates it |
| --- | --- | --- |
| `minamo` | avatar, drum kit overlay | Minamo, as browser sources |
| `obs` | background, game/display capture, microphone, music, chat overlay, alerts | the streamer, in OBS |

The tracker lists the `owner: 'obs'` entries under the situation selector, so
what Minamo is *not* going to do is visible rather than assumed.

## Two ways to hand off

### Copy a browser source URL

**Copy OBS source URL** puts the current situation's viewer URL on the clipboard,
already carrying `preset=obs`, the situation, transport, room, lighting preset,
`bg=transparent`, `hud=0` and `camera=locked`. Paste it into an OBS Browser
Source. Nothing else to configure.

This path needs no plugin and works when OBS runs on another machine.

### Drive OBS live over obs-websocket

**Connect OBS** opens obs-websocket 5.x (Tools → WebSocket Server Settings in
OBS 28+; default `ws://127.0.0.1:4455`). Minamo then:

1. reads OBS's real canvas size with `GetVideoSettings`, so the 1920x1080
   reference layout is scaled onto a 720p or 1440p project rather than assuming
   1080p;
2. creates the situation's scene if it does not exist;
3. creates its browser sources, or re-points them if they already exist;
4. positions each one with `SetSceneItemTransform`, using
   `OBS_BOUNDS_SCALE_INNER` so the avatar fits its box without distorting;
5. makes that scene current.

With **Switch OBS scene with situation** ticked, changing situation in Minamo
switches the OBS scene too — one control instead of two.

Every step is idempotent. A streamer switching situations mid-stream must not end
up with a second avatar stacked on the first, so an existing scene is reused and
an existing source is re-pointed, never duplicated.

## What crosses the socket

Scene names, source names and the viewer URL. No media, no tracking frame, no
camera pixel. The connection is reviewed on those terms in
`scripts/check-privacy-invariants.mjs`.

The obs-websocket password is read from the field when connecting and is never
persisted — the same rule the relay room token follows. Authentication uses the
v5 challenge digest (`base64(sha256(base64(sha256(password + salt)) + challenge))`),
so the password itself never leaves the page either.

## Scene names

Each situation names its OBS scene through an i18n key, so a Japanese UI creates
`Minamo - 雑談` and an English one creates `Minamo - Just chatting`. Renaming the
scene in OBS means Minamo will create its own again on the next apply; rename the
situation's `sceneNameKey` string instead if you want a different name to stick.

## Reference

- `shared/obs-bridge.js` — protocol helpers (`buildIdentifyPayload`,
  `buildObsSourceRequests`, `buildObsTransformRequests`) and `createObsBridge`.
- `shared/situation-presets.js` — `situationObsPlan` resolves a situation into
  positioned sources plus the delegated list.

## Testing

- `pnpm test` covers the v5 auth digest against a digest computed independently
  with `node:crypto`, Identify with and without authentication, create-vs-update
  request selection, and transform requests skipping sources whose scene item id
  is unknown.
- Manual: with OBS running, press **Connect OBS**, confirm the scene appears with
  the avatar positioned, switch situation and confirm OBS follows without
  duplicating sources.
