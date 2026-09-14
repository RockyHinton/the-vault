# Transactions, concurrency and audit

These three are one design: a command either happens completely, with its audit event, or
not at all, and a stale command never overwrites newer work.

## Transactions

1. **The service opens the unit of work.** One `withTransaction(db, async (tx) => …)` per
   command (ADR 0004). The read, the policy checks, the compare-and-set write, related rows
   and the audit event all use `tx`.
2. **Repositories never open transactions.** They take the executor as their first argument.
3. **Audit is inside the transaction.** `appendAuditEvent(tx, …)` from `server/modules/audit`
   commits or rolls back with the state change. A failed command leaves no event.
4. **CPU work before the transaction.** Password hashing happens before `withTransaction`.
5. **Files are the one two-phase case.** Bytes are written to storage first, then the
   `file_objects` row; a document command later claims the staged row inside its own
   transaction. A failed claim leaves a staged orphan that the sweep retires; a row never
   points at bytes that were not fully written.

## Concurrency

- **Every editable aggregate carries `version`.** Writes match on `id` and the caller's
  `version`; zero rows updated means stale, and the service throws `409 VERSION_CONFLICT`
  inside the transaction so nothing partial survives. Children that are edited independently
  (line items, departments, notes, payments) carry their own version.
- **Row locks where a cross-row invariant needs serialising.** Budget content commands lock
  the version row before checking it is still a draft; finance-source and cash-flow commands
  lock their parent row; `startRevision` locks the budget row before checking that nothing is
  open. `SELECT … FOR UPDATE` through the repository's `lockRow`.
- **PostgreSQL uniqueness is the backstop for create races.** "One per project", "one open
  version", "unique name" are unique or partial unique indexes. The service pre-checks them
  for a clear error and wraps the command in `withUniqueViolationAsConflict(constraintName, …)`
  (`server/db/unique-violation.ts`) so the concurrent loser gets the same 409, never a 500.
  Name the constraint; never map unique violations generically.
- **State predicates in destructive SQL.** Physical deletes of draft-only or unapproved-only
  rows carry that state in the `WHERE` clause, so locked or approved history cannot be
  deleted even by a future service mistake.
- **Client side.** Mutations read the record's latest `version` from the React Query cache
  at send time and serialise per record; a 409 refetches and the field shows the server's
  value. See [frontend-state.md](frontend-state.md).

## Audit

- **Vocabulary is typed.** `server/modules/audit/audit-actions.ts` is the `AuditAction`
  union `appendAuditEvent` accepts. Names are `<entity>.<past-tense verb>`
  (`budget_version.locked`, `finance_source.approved`); two legacy `.set` names are kept
  because persisted strings are never renamed. Add a domain's names there when the domain is
  added.
- **One event per meaningful command,** with `entityType`, `entityId`, the session actor
  (`actorUserId` from `req.localUser`, never from a body), the request ID, and metadata that
  makes the event useful later: `projectId`, changed field names, and from/to values for
  money, status and names. No credentials, no emails.
- **Nothing on failure**: validation, authorization, conflict and rolled-back transactions
  produce no event.
- **Audit is not version history.** Historical state lives in the domain's own rows
  (locked budget versions, document lineages, stage history); the audit trail records who did
  what, when.
- Read access is studio_admin only (`GET /api/v1/audit-events`).

## Cross-domain reads

Domains read each other; they never write each other's tables.

1. **Inside a transaction, read the other domain's repository.** A command that must decide
   on another domain's state within its own unit of work (Finance Plan checking that a
   budget version is locked, Cash Flow resolving the plan's departments, Documents refusing to
   delete a lineage that backs a live script) calls that repository with its own `tx`.
   Repositories are policy-free, so this cannot pull another service's rules or transaction
   into the command.
2. **Outside a transaction, compose services.** A read model that only assembles other
   domains' contracts (Financing Overview) takes the services as dependencies and calls
   their read methods; it owns no table and no transaction.
3. **Never call another domain's service from inside your transaction,** and never import a
   service from a domain that imports yours. The one shared write primitive is the Documents
   domain's `createDocumentInTransaction` / `addDocumentVersionInTransaction`, exported for
   owners to call with their `tx`.
