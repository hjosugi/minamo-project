# Quick Start

> 日本語版: [QUICKSTART.ja.md](QUICKSTART.ja.md)

## 0. Just look first

Serve the repository root with any local HTTP server:

```bash
./scripts/dev.sh          # or: python3 -m http.server 8000
```

Then open:

- http://localhost:8000/tracker/ — the real webcam tracker (52ch face + head pose)
- http://localhost:8000/viewer/ — the avatar viewer (drop a `.vrm`/`.glb` or Inochi2D `.inp`/`.inx` to swap avatars,
  or a tracker `.jsonl` recording to replay motion)
- http://localhost:8000/replay/ — local JSONL replay publisher for viewer testing
- http://localhost:8000/landing/ — the landing hub; **Start demo** overlays mock
  face/hand/drum tracking on your webcam (falls back to mock-only without one)

## 1. Developing with pnpm

```bash
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm dev        # vite dev server for the landing hub + TypeScript core
pnpm test       # structure smoke tests
```

## 2. Verify repository structure

```bash
python3 scripts/verify_structure.py
```

## 3. Relays (remote viewers)

```bash
pnpm --dir relay-node start                 # WebSocket relay + static site on :8787
cd relay-rs && cargo run --release          # WebTransport datagram relay (Rust)
```

For phone capture, open the desktop **Pair a tracker** panel, replace the
tracker/relay host with an HTTPS/WSS address reachable from the phone, and scan
the generated short-lived QR. The viewer URL remains independently copyable.
See [product/phone-tracker.md](product/phone-tracker.md).

See [README.md](../README.md) for the full connect walkthrough.

## 4. Registering the issue backlogs on GitHub

Two complementary backlogs ship with the repo:

- `docs/BACKLOG.md` — 53 curated issues `[KGM-001..053]`; register with the
  prompt in [ISSUE_REGISTRATION_PROMPT.md](ISSUE_REGISTRATION_PROMPT.md)
- `issues/backlog/` — 142 granular tasks; dry-run then register:

```bash
python3 scripts/create_github_issues.py --repo OWNER/REPO --dry-run
python3 scripts/create_github_issues.py --repo OWNER/REPO --apply
python3 scripts/create_github_issues.py --repo OWNER/REPO --apply --label priority/P0   # P0 only
python3 scripts/create_github_issues.py --repo OWNER/REPO --apply --label tracking/hand # hands only
```

Requires `gh auth login` first.

## 5. Recommended implementation order

1. Harden `src/core/oneEuroFilter.ts` and `src/core/anatomy.ts` with tests.
2. Connect MediaPipe Tasks Hand / Face Landmarker in `src/adapters/mediapipe_tasks_adapter.ts`.
3. Emit a `KGM1Frame` every frame.
4. Generate a per-finger `FingerState`.
5. Decompose face blendshapes into eye, mouth, brow, and cheek states.
6. Build drum-kit calibration and hit detection.
7. Add VRM, Live2D, and Inochi2D mappings.
8. Add the WebTransport sender.
9. Automate benchmarks, breakage detection, and low-light/occlusion tests.

## 6. Minimal MVP definition

MVP-0 is complete when:

- Webcam video can be captured in the browser.
- Face Landmarker provides face landmarks and blendshapes.
- Hand Landmarker provides left/right hands, 21 points, and world landmarks.
- Per-finger curl/spread/bend/tip velocity/confidence can be produced.
- Everything passes One Euro Filter + anatomy clamp + outlier rejection.
- KGM1 JSON frames are emitted at a 60 fps target.
- Values are visualized on the landing page.
- GitHub issues and quality gates are in place.

MVP-1 actually drives at least one of VRM / Live2D / Inochi2D.

MVP-2 runs drum-performance tracking with webcam + audio.
