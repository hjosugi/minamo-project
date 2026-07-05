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

## Tracking design (target system)

- [tracking/hand-finger-perfect-tracking.md](tracking/hand-finger-perfect-tracking.md) ([日本語](tracking/hand-finger-perfect-tracking.ja.md))
- [tracking/face-eye-mouth-high-precision.md](tracking/face-eye-mouth-high-precision.md) ([日本語](tracking/face-eye-mouth-high-precision.ja.md))
- [tracking/drum-performance-tracking.md](tracking/drum-performance-tracking.md) ([日本語](tracking/drum-performance-tracking.ja.md))
- [tracking/stability-anti-jitter.md](tracking/stability-anti-jitter.md)
- [tracking/occlusion-recovery.md](tracking/occlusion-recovery.md) ([日本語](tracking/occlusion-recovery.ja.md))
- [tracking/calibration.md](tracking/calibration.md)
- [tracking/benchmarking.md](tracking/benchmarking.md)

## Product

- [product/landing-page-hub.md](product/landing-page-hub.md) ([日本語](product/landing-page-hub.ja.md))
- [product/creator-ux.md](product/creator-ux.md) ([日本語](product/creator-ux.ja.md))
- [product/onboarding.md](product/onboarding.md)
- [product/desktop-app.md](product/desktop-app.md)
- [product/obs-setup.md](product/obs-setup.md)
- [product/drummer-setup.md](product/drummer-setup.md)
- [product/troubleshooting.md](product/troubleshooting.md)
- [product/creator-presets.schema.json](product/creator-presets.schema.json)
- [product/avatar-preset-profile.schema.json](product/avatar-preset-profile.schema.json)
- [product/expression-mapping.schema.json](product/expression-mapping.schema.json)

## Integrations, transport, compression

- [integrations/avatar-integrations.md](integrations/avatar-integrations.md)
- [transport/webtransport-realtime.md](transport/webtransport-realtime.md)
- [transport/kgm2-reference-codecs.md](transport/kgm2-reference-codecs.md)
- [transport/moq-evaluation.md](transport/moq-evaluation.md)
- [compression/avatar-compression.md](compression/avatar-compression.md)

## Engineering references

- [adr/README.md](adr/README.md) — architecture decision records
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [ISSUE_LABELS.md](ISSUE_LABELS.md)
- [DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md)
- [SECURITY_REVIEW.md](SECURITY_REVIEW.md)
- [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
- [benchmarks/quality-gates.md](benchmarks/quality-gates.md)
- [benchmarks/hand-stability-report.md](benchmarks/hand-stability-report.md)
- [dev/implementation-order.md](dev/implementation-order.md)
- [ml/model-roadmap-yolo-edge.md](ml/model-roadmap-yolo-edge.md)
- [security/privacy.md](security/privacy.md)
- [security/e2ee.md](security/e2ee.md)
- [references/reviewed-sources.md](references/reviewed-sources.md)

## Prompts (agent workflows)

- [../prompts/issue-registration-prompt.md](../prompts/issue-registration-prompt.md)
- [../prompts/implementation-agent-prompt.md](../prompts/implementation-agent-prompt.md)
- [../prompts/research-agent-prompt.md](../prompts/research-agent-prompt.md)
- [../prompts/review-agent-prompt.md](../prompts/review-agent-prompt.md)
