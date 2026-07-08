# Documentation Index

Primary language is English; documents that originated in Japanese keep a
`.ja.md` sub-version alongside.

## Start

- [../README.md](../README.md) ([日本語](../README.ja.md))
- [QUICKSTART.md](QUICKSTART.md) ([日本語](QUICKSTART.ja.md))
- [DEV_HTTPS.md](DEV_HTTPS.md)
- [ARCHITECTURE.md](ARCHITECTURE.md) — as implemented today
- [ARCHITECTURE_TARGET.md](ARCHITECTURE_TARGET.md) — target-state pipeline
- [PROTOCOL.md](PROTOCOL.md) — implemented KGM1 v1 wire format
- [PROTOCOL_V2_DRAFT.md](PROTOCOL_V2_DRAFT.md) — rich tracking schema draft (hands, drums, quality)
- [ROADMAP.md](ROADMAP.md) — milestones M0–M6 + phase appendix
- [GLOSSARY.md](GLOSSARY.md)
- [../replay/](../replay/) — local KGM1 JSONL replay tool

## Backlogs and registration

- [BACKLOG.md](BACKLOG.md) — 53 curated issues `[KGM-001..053]`
- [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md)
- [ISSUE_REGISTRATION_PROMPT.md](ISSUE_REGISTRATION_PROMPT.md) ([日本語](ISSUE_REGISTRATION_PROMPT.ja.md))
- [../issues/README.md](../issues/README.md) — 142 granular issue files ([日本語](../issues/README.ja.md))
- [../issues/register-prompt.md](../issues/register-prompt.md) ([日本語](../issues/register-prompt-ja.md))

## Design docs (curated backlog)

- [design/DD-001-hand-tracking.md](design/DD-001-hand-tracking.md)
- [design/DD-002-fullbody-onnx.md](design/DD-002-fullbody-onnx.md)
- [design/DD-003-audio-lipsync.md](design/DD-003-audio-lipsync.md)
- [design/DD-004-inochi2d.md](design/DD-004-inochi2d.md)
- [design/DD-005-elixir-relay-cluster.md](design/DD-005-elixir-relay-cluster.md)
- [design/DD-006-kgm2.md](design/DD-006-kgm2.md)
- [design/DD-007-recording.md](design/DD-007-recording.md)
- [design/DD-008-calibration-retargeting.md](design/DD-008-calibration-retargeting.md)
- [design/DD-009-onnx-backend-registry.md](design/DD-009-onnx-backend-registry.md) — runtime-toggleable pose backend registry (#23)

## Tracking design (target system)

- [tracking/hand-finger-perfect-tracking.md](tracking/hand-finger-perfect-tracking.md) ([日本語](tracking/hand-finger-perfect-tracking.ja.md))
- [tracking/face-eye-mouth-high-precision.md](tracking/face-eye-mouth-high-precision.md) ([日本語](tracking/face-eye-mouth-high-precision.ja.md))
- [tracking/drum-performance-tracking.md](tracking/drum-performance-tracking.md) ([日本語](tracking/drum-performance-tracking.ja.md))
- [tracking/drum-hihat-pedal.md](tracking/drum-hihat-pedal.md) — hi-hat pedal inference (#118)
- [tracking/drum-kick-pedal.md](tracking/drum-kick-pedal.md) — kick pedal inference (#119)
- [tracking/stability-anti-jitter.md](tracking/stability-anti-jitter.md)
- [tracking/occlusion-recovery.md](tracking/occlusion-recovery.md) ([日本語](tracking/occlusion-recovery.ja.md))
- [tracking/calibration.md](tracking/calibration.md)
- [tracking/benchmarking.md](tracking/benchmarking.md)

## Research (out-of-MVP evaluations)

- [research/multi-camera-fusion.md](research/multi-camera-fusion.md) (#183)
- [research/phone-camera-companion.md](research/phone-camera-companion.md) (#184)
- [research/imu-stick-integration.md](research/imu-stick-integration.md) (#185)

## Product

- [product/landing-page-hub.md](product/landing-page-hub.md) ([日本語](product/landing-page-hub.ja.md))
- [product/creator-ux.md](product/creator-ux.md) ([日本語](product/creator-ux.ja.md))
- [product/onboarding.md](product/onboarding.md)
- [product/desktop-app.md](product/desktop-app.md)
- [product/obs-setup.md](product/obs-setup.md)
- [product/drummer-setup.md](product/drummer-setup.md)
- [product/drum-obs-overlay.md](product/drum-obs-overlay.md) — transparent OBS drum overlay (#120)
- [product/drum-dataset.schema.json](product/drum-dataset.schema.json) — YOLO stick/drum label schema (#122)
- [product/multi-avatar-rooms.md](product/multi-avatar-rooms.md)
- [product/phone-tracker.md](product/phone-tracker.md)
- [product/layered-avatar.md](product/layered-avatar.md)
- [product/troubleshooting.md](product/troubleshooting.md)
- [product/creator-presets.schema.json](product/creator-presets.schema.json)
- [product/avatar-preset-profile.schema.json](product/avatar-preset-profile.schema.json)
- [product/expression-mapping.schema.json](product/expression-mapping.schema.json)
- [product/layered-avatar.schema.json](product/layered-avatar.schema.json)

## Integrations, transport, compression

- [integrations/avatar-integrations.md](integrations/avatar-integrations.md)
- [transport/webtransport-realtime.md](transport/webtransport-realtime.md)
- [transport/kgm2-reference-codecs.md](transport/kgm2-reference-codecs.md)
- [transport/moq-evaluation.md](transport/moq-evaluation.md)
- [compression/avatar-compression.md](compression/avatar-compression.md) — overview + kagami-pack CLI (#41)
- [compression/glb-inspection.md](compression/glb-inspection.md) (#156)
- [compression/gltf-transform.md](compression/gltf-transform.md) (#157)
- [compression/ktx2-textures.md](compression/ktx2-textures.md) (#158)
- [compression/meshopt-vs-draco.md](compression/meshopt-vs-draco.md) (#159)
- [compression/texture-atlas-2d.md](compression/texture-atlas-2d.md) (#160)
- [compression/motion-delta-quantization.md](compression/motion-delta-quantization.md) (#161)
- [compression/visual-regression-checklist.md](compression/visual-regression-checklist.md) (#162)
- [compression/asset-license-checklist.md](compression/asset-license-checklist.md) (#163)

## Engineering references

- [adr/README.md](adr/README.md) — architecture decision records
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [ISSUE_LABELS.md](ISSUE_LABELS.md)
- [DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md)
- [SECURITY_REVIEW.md](SECURITY_REVIEW.md)
- [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
- [benchmarks/quality-gates.md](benchmarks/quality-gates.md)
- [benchmarks/hand-stability-report.md](benchmarks/hand-stability-report.md)
- [benchmarks/face-quality-benchmarks.md](benchmarks/face-quality-benchmarks.md)
- [benchmarks/drum-benchmark-metrics.md](benchmarks/drum-benchmark-metrics.md)
- [benchmarks/onnx-pose-backends.md](benchmarks/onnx-pose-backends.md) — pose backend fps/VRAM table (#23)
- [dev/implementation-order.md](dev/implementation-order.md)
- [ml/model-roadmap-yolo-edge.md](ml/model-roadmap-yolo-edge.md)
- [ml/dataset-labeling-guide.md](ml/dataset-labeling-guide.md)
- [ml/drum-dataset-schema.md](ml/drum-dataset-schema.md) — YOLO stick/drum training schema (#122)
- [security/privacy.md](security/privacy.md)
- [security/e2ee.md](security/e2ee.md)
- [references/reviewed-sources.md](references/reviewed-sources.md)

## Prompts (agent workflows)

- [../prompts/issue-registration-prompt.md](../prompts/issue-registration-prompt.md)
- [../prompts/implementation-agent-prompt.md](../prompts/implementation-agent-prompt.md)
- [../prompts/research-agent-prompt.md](../prompts/research-agent-prompt.md)
- [../prompts/review-agent-prompt.md](../prompts/review-agent-prompt.md)
