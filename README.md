# Minamo

[![ci](https://github.com/hjosugi/minamo-project/actions/workflows/ci.yml/badge.svg)](https://github.com/hjosugi/minamo-project/actions/workflows/ci.yml)

> 日本語版: [README.ja.md](README.ja.md)

High-precision avatar tracking that anyone can use with a single ordinary
webcam — free, low-latency, and local-first.

## Goals

- Anyone can stream with a 2D/3D avatar cheaply, starting with nothing but a webcam.
- Track face, eyes, mouth, hands, individual fingers, upper body — and even
  drum performance — with high precision.
- Motion must never look jittery, broken, bent the wrong way, or unnatural:
  stability is the top priority.
- Local inference is the default: camera video never leaves the device. Only
  motion parameters go over the network (~76 bytes/frame, roughly 1/400 of video).
- Integrate WebTransport, WebGPU/WASM, Rust, and BEAM-style routing with
  glTF/VRM/Live2D/Inochi2D rendering backends.
- Anything not yet implemented lives as design docs and issue-ready backlog
  entries, so the whole plan is visible on GitHub.

## What works today

- In-browser inference (MediaPipe Face Landmarker, GPU/WASM); 52 expression
  channels + head pose + experimental upper body, smoothed with One Euro filters
- Camera device/resolution/fps controls, persisted tracker/viewer settings,
  calibration profiles, local JSONL recording and replay, signal quality
  warnings, and wrap-safe viewer jitter handling
- Three delivery tiers: BroadcastChannel (no server) / WebSocket (compatible) /
  WebTransport datagrams (lowest latency, Rust relay), with optional room tokens
- VRM viewer (three-vrm) with a built-in bot fallback; 2D (Inochi2D) is designed
- A landing hub with a mock tracking visualization demo under [landing/](landing/)

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (implemented) and
[docs/ARCHITECTURE_TARGET.md](docs/ARCHITECTURE_TARGET.md) (target state).
Protocol: [docs/PROTOCOL.md](docs/PROTOCOL.md) (implemented v1 wire format) and
[docs/PROTOCOL_V2_DRAFT.md](docs/PROTOCOL_V2_DRAFT.md) (rich tracking schema draft).

## Quick start

### 1. No server (local mode)

```sh
./scripts/dev.sh            # plain static serving (python3 -m http.server 8000)
```

1. Open http://localhost:8000/tracker/ and press **Start tracking**
2. Keep mode: local and press **Connect**
3. "Open viewer in another tab" — it works via BroadcastChannel in the same browser
4. Drop a `.vrm` file onto the viewer to swap in your own avatar. For recorded
   motion, drop a tracker `.jsonl` onto the viewer or open `/replay/` and publish
   it to the same local room.

The landing hub and mock demo are at http://localhost:8000/landing/.
GitHub Pages publishes the static tracker/viewer/replay/landing files directly
from `main`.

For offline model serving:

```sh
./scripts/fetch-models.sh
```

The tracker will prefer `vendor/mediapipe/` and fall back to the pinned CDN
URLs when local assets are absent.

### 2. WebSocket relay (viewer on another machine)

```sh
cd relay-node && npm install && npm start   # serves the site + relays on :8787
```

Set mode: ws on both tracker and viewer, use the same room name, Connect.
Set `MINAMO_RELAY_TOKEN` to require the room token field.

### 3. WebTransport relay (lowest latency)

```sh
cd relay-rs && cargo run --release
```

Paste the `cert sha-256` from the startup log into the cert field of tracker
and viewer, set mode: wt, Connect. The certificate is self-signed (14-day
limit) and regenerates on restart. relay-rs follows the wtransport 0.7 API
docs but CI compilation is tracked in KGM-009.

More setup detail: [docs/QUICKSTART.md](docs/QUICKSTART.md).
LAN/phone HTTPS setup: [docs/DEV_HTTPS.md](docs/DEV_HTTPS.md).

## Repository layout

```
tracker/     webcam -> 52ch expressions + head pose -> KGM1 publisher
viewer/      KGM1 receiver -> VRM / built-in bot rendering (OBS browser source)
replay/      local KGM1 motion JSONL replay publisher
shared/      canonical blendshapes, One Euro, KGM1 codec, transports (JS)
src/         TypeScript core for the next-gen pipeline (types, filters,
             anatomy constraints, adapters for MediaPipe/VRM/Live2D/Inochi2D)
crates/      Rust KGM1 binary header codec
relay-node/  static serving + WebSocket relay (Node, ws only)
relay-rs/    WebTransport datagram relay (Rust / wtransport)
services/    Erlang/OTP router design skeleton
landing/     landing page hub + webcam/mock tracking demo
docs/        specs, architecture, roadmap, design docs, curated backlog
issues/      142 granular issue-ready Markdown files + registration script
prompts/     agent prompts (implementation, research, review, registration)
scripts/     dev server, issue registration, structure verification
tests/       structure smoke tests
```

Full documentation index: [docs/INDEX.md](docs/INDEX.md).

## Roadmap and issues

The plan lives in two complementary backlogs, both registered as GitHub issues:

- [docs/BACKLOG.md](docs/BACKLOG.md) — 53 curated issues `[KGM-001..053]`
  across milestones M0–M6 (see [docs/ROADMAP.md](docs/ROADMAP.md)); large items
  have design docs under [docs/design/](docs/design/)
- [issues/backlog/](issues/backlog/) — 142 granular implementation tasks
  (hands, fingers, stability, face, drums, transport, rendering), registered
  with [scripts/create_github_issues.py](scripts/create_github_issues.py)

Bulk registration prompts:
[docs/ISSUE_REGISTRATION_PROMPT.md](docs/ISSUE_REGISTRATION_PROMPT.md) and
[issues/register-prompt.md](issues/register-prompt.md).

Contributor and release docs:
[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md),
[docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md),
[docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md), and
[docs/DEPENDENCY_POLICY.md](docs/DEPENDENCY_POLICY.md).

## Related projects

Kalidokit (solver prior art), OpenSeeFace/VSeeFace (parameter-transport prior
art), Inochi2D/inox2d (open 2D format), moeru-ai/airi, and
handcrafted-persona-engine (an intended KGM1 consumer). See the comparison
table in ARCHITECTURE.md for positioning.

## License

0BSD. You can use, copy, modify, and distribute this project for almost any purpose.


MIT
