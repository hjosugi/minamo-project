<!-- i18n: language-switcher -->
[English](PAGES_DEMO.md) | [日本語](PAGES_DEMO.ja.md)

# GitHub Pages Demo Guide

Live site: <https://hjosugi.github.io/minamo-project/>

Minamo's GitHub Pages site is the public entry point for understanding and
trying the project. It provides three different levels of interaction so the
simulation is not confused with real tracking.

## 1. UI demo — camera optional

Open [the browser demo](https://hjosugi.github.io/minamo-project/landing/) and
press **Start demo**. It visualizes simulated face, hand, and drum signals. If
camera access is allowed, the mock overlay is drawn over the local preview; if
access is denied or unavailable, the animation still runs by itself.

The skeleton, confidence, and drum-hit values on this page are simulated. They
show the intended UI and signal flow, not MediaPipe measurement accuracy.

## 2. Real webcam tracker

1. Open [Tracker](https://hjosugi.github.io/minamo-project/tracker/).
2. Allow camera access and press **Start tracking**.
3. Keep transport set to `local`, then press **Connect**.
4. Open [Viewer](https://hjosugi.github.io/minamo-project/viewer/) in another
   tab in the same browser.
5. Use the built-in bot, or drop a local `.vrm`, `.glb`, `.inp`, or `.inx`
   avatar onto Viewer.

The local mode uses `BroadcastChannel`; it needs no relay server and does not
upload camera video.

## 3. Viewer and replay without a camera

- [Viewer](https://hjosugi.github.io/minamo-project/viewer/) accepts a local
  avatar or a tracker `.jsonl` recording by drag and drop.
- [Replay](https://hjosugi.github.io/minamo-project/replay/) publishes a local
  KGM1 JSONL recording to Viewer for repeatable inspection.

Files selected in these pages remain local to the browser unless the user
explicitly configures a network relay.

## What works and what is experimental

Ready to try in a supported desktop browser:

- MediaPipe face expressions and head pose
- local tracker-to-viewer transport, recording, and replay
- VRM/GLB viewer and OBS-oriented transparent display
- calibration, smoothing, and quality diagnostics

Still experimental or dependent on manual hardware validation:

- Inochi2D WASM rendering and real-puppet fidelity
- WebTransport and phone/Safari pairing paths
- real drum, pedal, and fast-roll accuracy
- OS-specific virtual camera backends

See [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md) and
[ROADMAP.md](ROADMAP.md) before treating an experimental path as release-ready.

## Privacy and browser permissions

Camera permission is requested only by pages that need a local preview or real
tracking. The mock demo continues without it. Minamo does not upload raw camera
video in the default local flow. See [security/privacy.md](security/privacy.md)
for the full data-boundary description.

## Local preview and deployment

```bash
pnpm install --frozen-lockfile
pnpm build
python3 -m http.server 8000 --directory dist
```

Then open <http://localhost:8000/>. The `Pages` workflow builds `dist/` and
deploys it after a push to `main`. Before merging a Pages change, run:

```bash
pnpm lint
pnpm test
pnpm verify
pnpm build
```

