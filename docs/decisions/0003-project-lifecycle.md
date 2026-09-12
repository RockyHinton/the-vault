# ADR 0003: Explicit project lifecycle operations

## Decision

Projects use explicit endpoints for stage transition, archive, restore and deletion rather than a
generic lifecycle PATCH.

## Consequences

State history and audit entries are committed atomically. Records use optimistic versions and
soft deletion so project provenance remains available for a future retention policy.