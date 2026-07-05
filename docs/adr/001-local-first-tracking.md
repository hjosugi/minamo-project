# ADR-001: Local-first tracking by default

## Status

Accepted

## Context

The product uses webcams and may process face, hand, and body signals. Users need trust.

## Decision

Raw camera frames and raw audio are processed locally by default. Remote collaboration sends KGM1 motion frames unless the user explicitly enables video sharing.

## Consequences

- Lower server cost.
- Better privacy posture.
- Browser performance is critical.
- Custom model deployment must support WebGPU/WASM or desktop local services.

## Validation

- Automated checks: `npm test`, `npm run verify`
- Manual checks: tracker startup copy states that video stays in-browser.
- Security/privacy review: see `docs/SECURITY_REVIEW.md`.

## Alternatives considered

### Server-side inference

- Pros: easier centralized model updates.
- Cons: unacceptable default privacy and network latency for face tracking.

### Local-first inference

- Pros: privacy-preserving, lower latency, works in local demo mode.
- Cons: requires browser capability checks and model vendoring.

## References

- Related issue: #179
- Related docs: `docs/security/privacy.md`, `docs/SECURITY_REVIEW.md`
