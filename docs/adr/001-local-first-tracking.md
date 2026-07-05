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
