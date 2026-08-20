<!-- i18n: language-switcher -->
[English](privacy.md) | [日本語](privacy.ja.md)

# Security and Privacy

## Default rule

Do not send raw webcam frames to a server by default. Local-only mode also must
not gain undeclared third-party telemetry through a runtime dependency.

## Data classes

| Data | Default storage | Default transport |
|---|---|---|
| raw webcam frames | memory only | never |
| raw audio | memory only | never |
| dependency performance/utilization metrics | none | never in local-only mode |
| KGM1 motion frame | optional local recording | allowed with user action |
| calibration profile | local storage / file | explicit export only |
| benchmark video | local file | explicit opt-in upload only |

## Threats

- accidental raw video upload
- malicious avatar package
- malicious npm package
- dependency update that adds automatic telemetry
- model supply-chain attack
- browser permission confusion
- remote room impersonation

## Mitigations

- clear camera indicator
- local-first mode
- dependency pinning
- installed-bundle telemetry scanning (`pnpm check:mediapipe`)
- model hash verification
- content security policy
- room tokens
- audit logs without raw media

## Dependency egress

The first-party privacy invariant proves that values derived from camera/media
APIs do not reach reviewed network sinks in Minamo source. It cannot by itself
prove that minified code inside `node_modules` has no sender. Both checks are
required.

`@mediapipe/tasks-vision` remains pinned to `0.10.35` because its published
`1.0.1` browser bundle adds automatic ODML performance/utilization metrics.
`scripts/mediapipe-privacy-guard.mjs` scans the installed browser entry bundles
for that endpoint and sender infrastructure in pull-request CI and release
smoke. Do not weaken the guard in a dependency update. See
[the 1.0 migration watchlist](../mediapipe-1.0-migration.md).
