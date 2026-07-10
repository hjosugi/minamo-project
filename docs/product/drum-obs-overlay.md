# Drum OBS Overlay

Status: implemented for issue #120. See also
[drummer-setup.md](drummer-setup.md).

The drum overlay is a transparent browser source for OBS that flashes each kit
zone when it is hit. It is separate from the tracker's live hand-to-zone overlay
(`deriveDrumOverlayState`): the OBS overlay renders streamed `DrumHitEvent`
packets, so it works next to the viewer or on a second machine.

## Usage

1. Open `viewer/drum-overlay.html` as an OBS browser source.
2. Add it with a transparent background; the page renders nothing opaque.
3. Append `?demo=1` to preview synthetic hits while positioning the source.
4. In local mode, the tracker/viewer publishes hits on the `minamo-drum`
   `BroadcastChannel`; the overlay folds them into decaying flashes.

## Reducer

The render logic is `shared/drum-overlay.js`:

- `reduceDrumOverlay(state, event, nowMs)` folds one hit into per-zone state and
  ignores duplicate `eventId`s.
- `deriveObsOverlayState(state, nowMs, { decayMs })` returns each zone's flash
  alpha (linear decay to 0 over `decayMs`), the active zone ids, and a hit
  counter.

## Testing

- `pnpm test` covers the reducer: hits raise the right zone's flash, flashes
  decay to 0 after the decay window, duplicate events do not double-count, and
  the hit counter tracks total hits.
- Manual: load the overlay in OBS with `?demo=1` and confirm transparent
  background and per-zone flashes.
