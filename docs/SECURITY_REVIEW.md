# Security Review Checklist

- Camera frames never leave the tracker page.
- Relay payloads contain only KGM motion data, not video or audio.
- Optional room tokens are enabled for shared or public relays.
- `KAGAMI_ALLOWED_ORIGINS` is set for public WebSocket deployments.
- Token checks use constant-time comparison.
- No secrets are committed in docs, source, issue bodies, or recordings.
- JSONL recordings are explicitly local and user-initiated.
- Third-party model and WASM assets have pinned versions and SHA/SRI metadata.
- New network features document downgrade, replay, and origin behavior.
