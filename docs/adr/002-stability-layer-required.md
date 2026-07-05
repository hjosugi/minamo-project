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
