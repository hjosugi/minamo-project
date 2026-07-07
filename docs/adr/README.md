# Architecture Decision Records

ADRs record decisions that shape the tracker, viewer, relays, protocol, and
developer workflow. New ADRs should start from `000-template.md`, use a stable
number, and include the related issue in `## References`.

| ADR | Status | Area | Related issue |
| --- | --- | --- | --- |
| [000-template.md](000-template.md) | Proposed | devex | #181 |
| [001-local-first-tracking.md](001-local-first-tracking.md) | Accepted | privacy / tracking | #179 |
| [002-stability-layer-required.md](002-stability-layer-required.md) | Accepted | tracking / render | #176 |

## Required Sections

- `## Status`
- `## Context`
- `## Decision`
- `## Consequences`
- `## Validation`
- `## Alternatives considered`
- `## References`

`npm run verify` checks these sections and the status value.
