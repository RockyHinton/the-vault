# Architecture

## Shape

The Vault is a TypeScript modular monolith: React/Vite is served by an Express process, which
exposes `/api/v1` and owns PostgreSQL access. A deployment is for one studio; there is no
application multi-tenancy. The hosting provider (Replit today) is configuration, not
architecture.

```
React page/component → feature hook → typed API client → Express route (validate, authorize)
→ service/use-case (policy, transaction) → repository (queries on the given executor)
→ audit repository (same executor) → Drizzle → PostgreSQL
```

Routes are thin. Services own policy, lifecycle rules and transactions. Repositories own
queries. Shared Zod contracts (`shared/contracts`) are public API shapes, never Drizzle rows.
Do not add generic repository/service base classes, an ORM abstraction over Drizzle, or
cross-domain imports.

## Modules

- `server/index.ts`: process entrypoint (load env, validate, create database, start).
- `server/app.ts`: composition root, `createVaultServer({ env, db, frontend })`. Middleware
  order, authentication, services, API router, frontend and error handler are assembled here
  and nowhere else. Tests build the app through the same function.
- `server/config`: typed environment validation; `.env.local` loading outside production.
- `server/db`: `createDatabase` (pool, fail-closed test guard), `withTransaction`, executor types.
- `server/http`: request ID, `validate`, `handle`, safe errors, request logging.
- `server/middlewares`: provider-specific Clerk proxy only (production topology).
- `server/modules/<domain>`: `<domain>-routes.ts`, `<domain>-service.ts`,
  `<domain>-repository.ts`, plus pure domain rules (e.g. `project-lifecycle.ts`).
- `server/modules/audit`: the only writer of `audit_events`.
- `server/modules/auth`: Clerk identity → local user resolution, role guard, bootstrap.
- `shared/schema.ts`: PostgreSQL schema only. `shared/contracts`: Zod request/response contracts.
- `client/src/features/<domain>`: API access and React Query hooks.

## Transaction ownership rule

1. **A service opens the unit of work.** Every business operation that changes state runs inside
   one `withTransaction(db, async (tx) => { ... })` in the service. The read of the current row,
   the policy checks, the compare-and-set write, the stage-history row and the audit event all
   use `tx`.
2. **Repositories never open transactions.** Every repository function takes the executor as its
   first argument (`DatabaseExecutor` for reads, `Transaction` for writes that must be atomic) and
   returns rows or `undefined`. They contain no policy and no audit vocabulary.
3. **Audit events go through `appendAuditEvent(tx, …)`** from `server/modules/audit`, with the
   same executor as the state change, so they commit or roll back together.
4. **Optimistic concurrency is enforced in the write predicate.** Writes match on `id` and the
   caller's `version`; zero rows updated means the caller is stale. The service throws
   `409 VERSION_CONFLICT` inside the transaction, so a stale write leaves no history or audit rows.
5. **Persistence input types are narrow.** A repository update accepts only the columns that
   operation may change (`ProjectEditableFields`, not `Partial<$inferInsert>`).

Reference shape, from `server/modules/projects/project-service.ts`:

```ts
async transition(id, input, actor) {
  const row = await withTransaction(db, async (tx) => {
    const existing = requireProject(await projectRepository.findById(tx, id));
    requireNotArchived(existing, "Restore the project before changing its stage.");
    if (!canTransitionProjectStage(existing.stage, input.toStage))
      throw new ApiError(422, "INVALID_STAGE_TRANSITION", "…");
    const updated = requireFresh(
      await projectRepository.changeStage(tx, { id, expectedVersion: input.version, toStage: input.toStage }),
    );
    await projectRepository.appendStageHistory(tx, { projectId: updated.id, fromStage: existing.stage, … });
    await appendAuditEvent(tx, { actorUserId: actor.userId, action: "project.stage_changed", … });
    return updated;
  });
  return toContract(row);
}
```

Services are created by a factory (`createProjectService({ db })`) and receive their
dependencies explicitly. There are no module-scope singletons holding connections.

## HTTP boundary

- `requestId` is the first middleware, so every rejection (including untrusted hosts) carries a
  real request ID.
- Request input is parsed with `validate(schema, value)`; a failure is `400 VALIDATION_ERROR`
  with field details. A `ZodError` anywhere else (for example a response contract check) is a
  server bug and surfaces as `500`, logged as `RESPONSE_CONTRACT_VIOLATION`.
- Body-parser failures map to `400 INVALID_JSON`, `413 PAYLOAD_TOO_LARGE`, `415 …`.
- Async routes are wrapped with `handle(async (req, res) => …)`; no per-route try/catch.
- Every error response is `{ error: { code, message, details?, requestId } }`.

## Authentication and access

Clerk proves browser identity using its cookie session. The application never sends browser
bearer tokens. Express verifies the cookie through Clerk middleware, then `requireLocalUser`
resolves `application_users`. Only active local users proceed; `studio_admin` guards project
writes. An authenticated Clerk user without a local account receives `403 LOCAL_ACCESS_REQUIRED`
with their own Clerk user ID in `details`, so an operator can provision them.

No public just-in-time access exists. The only automatic insertion is a one-time operator
bootstrap when the authenticated Clerk user ID exactly equals `VAULT_BOOTSTRAP_ADMIN_CLERK_ID`;
email and display name come from the Clerk backend API, and the insert and its audit event share
one transaction. Provisioning further users is deferred to a users domain.

Tests use an identity seam (`createVaultServer({ verifiedIdentity })`) instead of Clerk. It is
refused outside `NODE_ENV=test`, and when active Clerk middleware is not mounted at all, so tests
never depend on Clerk's network.

## Projects reference domain

Projects persist core identity, metadata, active stage, archive metadata, optimistic `version`,
and soft deletion timestamp. Stage change, archive, restore, and delete are explicit operations.
Each state transition and audit event is committed in the same transaction. Deletion is soft to
retain provenance; it is hidden from all product reads and writes. Lists are cursor-paginated
and fetch one extra row so `nextCursor` is set only when more rows exist.

The frontend maps the API project to the legacy workspace shape in
`project-fixture-adapter.ts`. The adapter is an intentional boundary: server core data is
authoritative, while finance, scripts, rights, documents, people and other feature fixture state
is not persisted and must not be mistaken for production data.

## Database conventions

Use PostgreSQL UUID keys, UTC `timestamptz`, foreign keys, indexes for actual access paths and
explicit constraints. Use migrations under `migrations/`; never run DDL at application startup.
Changes that update records and audit/stage history use one transaction. Use optimistic versions
for user edits and return `409 VERSION_CONFLICT` rather than losing changes.

## Test-environment safety

`createDatabase` refuses to bind the application pool to any database not named `vault_test_*`
when `NODE_ENV=test`. Test setup creates a disposable `vault_test_<uuid>` database, migrates it
with the checked-in migrations, and drops it afterwards; Playwright drops its database from a
global teardown because the web server process is killed without hooks. Tests never mutate
`process.env` to point the app at a database: they pass an explicit `Environment` and `db`.

## Security and observability

API errors have a stable envelope and request ID. JSON logs contain event names, request IDs,
method/path/status and duration only; the logger redacts cookies, authorization, secrets, tokens,
passwords and database URLs. Helmet, body limits and API rate limiting are baseline controls.
There is no permissive CORS policy: browser access is same-origin. Clerk session-cookie CSRF
controls are owned by Clerk; state-changing routes also require validated Clerk auth and local role.

`/api/v1/health` is process health; `/api/v1/ready` verifies database reachability.

## How to add a domain

1. Add a focused schema migration and update `shared/schema.ts`.
2. Define Zod API contracts before routes.
3. Add `<domain>-repository.ts` (executor-taking query functions, narrow input types),
   `<domain>-service.ts` (`create<Domain>Service({ db })`, one `withTransaction` per command,
   `appendAuditEvent` inside it) and `<domain>-routes.ts` (`validate`, role guard, `handle`).
4. Mount the router in `server/routes.ts` behind `requireLocalUser` and construct the service in
   `server/app.ts`.
5. Add a typed client API module and React Query hooks.
6. Add tests: unit for pure rules, integration against the disposable database for policy,
   constraints, concurrency and audit rows, and a browser check for the UI path.

Avoid raw `fetch` in components, provider SDK use outside adapters, UI state as a source of truth
for server records, feature-specific data in the Project core table, repositories that open
transactions, and audit inserts outside `server/modules/audit`.
