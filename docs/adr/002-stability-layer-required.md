# ADR-002: Stability layer is required before avatar mapping

## Status

Accepted

## Context

Raw ML landmarks can jitter, flip, or become invalid. Avatar rigs amplify those failures visually.

## Decision

All ML outputs must pass quality gates, smoothing, anatomy constraints, and rig clamps before rendering or transport.

## Consequences

- Slight extra latency is accepted.
- Visual quality improves.
- Every new adapter must provide confidence and warnings.

## Validation

- Automated checks: `npm test`, `npm run verify`
- Manual checks: avatar motion smoke tests include no broken fingers, no face
  flicker, and no stale frame regression.
- Benchmark or latency evidence: see `docs/benchmarks/quality-gates.md`.

## Alternatives considered

### Map raw landmarks directly

- Pros: lowest implementation effort.
- Cons: exposes jitter, NaN values, left/right swaps, and impossible poses to
  avatar rigs.

### Require stability layer before mapping

- Pros: predictable avatar behavior and testable quality gates.
- Cons: small latency and complexity cost.

## References

- Related issue: #176
- Related docs: `docs/tracking/stability-anti-jitter.md`,
  `docs/benchmarks/quality-gates.md`
