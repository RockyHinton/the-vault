# ADR 0004: Services own transactions; repositories take an executor

## Decision

A business operation that changes state is one PostgreSQL transaction opened by the service
with `withTransaction(db, tx => …)` (`server/db/transaction.ts`). Repository functions never
open transactions; each takes the executor it must run on (`DatabaseExecutor` for reads,
`Transaction` for atomic writes). Audit events are written only through
`appendAuditEvent(tx, …)` in `server/modules/audit`, with the same executor as the change.
Services are created by small factories (`createProjectService({ db })`) so dependencies are
explicit; there are no module-scope singletons holding connections.

## Context

The first version of the Projects module opened a transaction inside every repository method
and inlined stage-history and audit inserts there. That worked for one aggregate but made it
impossible for a service to compose two repositories atomically, and it left the audit module
unused. Projects is the template every future domain copies, so the boundary had to be fixed
before a second domain existed.

## Consequences

- Cross-aggregate operations (a document attached to a project, a rights record that changes
  project state) can share one transaction without restructuring.
- Optimistic concurrency stays in the write predicate; a stale write throws inside the
  transaction and produces no history or audit rows.
- Repositories are testable and boring: queries in, rows out, narrow input types.
- Nothing generic was added: no unit-of-work class, no base repository, no ORM wrapper.
