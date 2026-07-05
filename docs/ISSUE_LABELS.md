# Issue Label Taxonomy

Labels should make triage mechanical: an issue normally gets one `type/*`, one
or more `area/*`, and a priority label when scheduling matters.

## Areas

- `area/tracking`: camera, landmarks, filters, calibration, quality warnings
- `area/body`: hands, fingers, pose, drums, full-body inference
- `area/protocol`: KGM1/KGM2 encoding, JSONL, replay, compatibility
- `area/transport`: BroadcastChannel, WebSocket, WebTransport, relay auth
- `area/render`: VRM, Live2D, Inochi2D, OBS, visual regression
- `area/audio`: onset detection, lipsync, voice activity
- `area/tooling`: tests, benchmarks, recording, debug surfaces
- `area/app`: onboarding, settings, product pages, UX
- `area/infra`: CI, Docker, deploy, dependency updates
- `area/docs`: guides, ADRs, release/security checklists

## Types

- `type/feature`: user-visible capability
- `type/bug`: broken or unsafe behavior
- `type/chore`: maintenance or operations
- `type/research`: evaluation with a written decision
- `type/docs`: documentation-only change

## Priorities

- `priority/P0`: blocks local development, CI, security, or core demos
- `priority/P1`: important for the next milestone
- `priority/P2`: useful backlog work with no immediate release pressure

## Rules

- Use `type/research` when the expected output is a comparison or decision
  document, not production code.
- Use `type/docs` when no runtime behavior changes.
- Add `area/protocol` when a change affects KGM1/KGM2 compatibility, even if
  the code lives in tracker, viewer, or relay packages.
- Add `area/infra` for CI, Docker, dependency policy, release, and issue
  workflow changes.
- Do not use labels as status markers. Status belongs in issue comments,
  milestones, or linked pull requests.

## Examples

- "Add WebTransport receiver prototype": `type/feature`,
  `area/transport`, `area/protocol`
- "Compare MediaPipe Tasks vs custom ONNX": `type/research`,
  `area/tracking`, `area/body`
- "Add security review checklist": `type/docs`, `area/infra`, `area/docs`
- "Fix stale frame freeze in viewer": `type/bug`, `area/render`,
  `area/protocol`
