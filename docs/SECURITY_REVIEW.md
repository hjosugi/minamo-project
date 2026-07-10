# Security Review Checklist

Use this checklist before merging features that touch camera input, local
recording, relays, model assets, WebTransport/WebSocket, tokens, or release
artifacts.

## Data Boundaries

- Camera frames never leave the tracker page by default.
- Raw audio never leaves the local device by default.
- Relay payloads contain only KGM motion data, not video or audio.
- Any feature that transmits media requires explicit user action and visible
  UI copy.
- JSONL recordings are explicitly local and user-initiated.

## Relay And Transport

- Optional room tokens are enabled for shared or public relays.
- `MINAMO_ALLOWED_ORIGINS` is set for public WebSocket deployments.
- Token checks use constant-time comparison.
- New network features document downgrade, replay, and origin behavior.
- Stale or reordered frames are rejected by sequence-aware receiver logic.
- WebTransport certificate fingerprints are shown clearly during local
  development.

## Client Storage

- Calibration profiles, tracker settings, and recordings stay local unless the
  user exports them.
- Local storage keys do not contain secrets.
- Import paths validate shape and bounds before applying values.
- Exported files avoid raw camera frames unless the feature explicitly records
  them.

## Phone Pairing Tokens

- `relay-node` binds generated pairing tokens to one room, limits their TTL to
  30–900 seconds, and rejects expired, revoked, unknown, or wrong-room tokens.
- Regeneration revokes the prior token; the issuance and QR fallback endpoints
  use `Cache-Control: no-store` and honor `MINAMO_ALLOWED_ORIGINS`.
- Tracker/viewer pages remove QR tokens from the address bar after parsing and
  do not persist those transient tokens to local storage. Relay logs never
  include token or QR payload values.
- QR images and copied URLs are credentials. Evidence screenshots and
  diagnostics must redact them before publication.
- Public phone pairing still requires HTTPS/WSS and a configured origin allow
  list. Secure transport negotiation and downgrade handling remain tracked by
  #227; the token UI is not a substitute for TLS.

## Supply Chain

- Third-party model and WASM assets have pinned versions and SHA/SRI metadata
  where practical.
- New dependencies follow `DEPENDENCY_POLICY.md`.
- CDN fallbacks are documented and local vendoring paths are preferred.
- No secrets are committed in docs, source, issue bodies, logs, or recordings.

## Release Review

- Run the full `RELEASE_CHECKLIST.md`.
- Review generated artifacts before publishing.
- Public deployment docs include token and origin configuration.
- Security-relevant changes mention residual risks in the issue closure note.
