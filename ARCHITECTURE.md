# Architecture

## Shape

The Vault is a TypeScript modular monolith: React/Vite is served by an Express process, which
exposes `/api/v1` and owns PostgreSQL access. A deployment is for one studio; there is no
application multi-tenancy. The hosting provider (Replit today) is configuration, not
architecture. There is no external identity provider: authentication is first-party (ADR 0007).

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
- `server/http`: request ID, host allowlist and origin guard, `validate`, `handle`, safe errors,
  request logging.
- `server/modules/auth`: the whole authentication lifecycle: password hashing, session
  cookie, session and credential repositories, `createAuthService` (login, session resolution,
  logout), `createRequireLocalUser`, `requireStudioAdmin`, and the `/auth` routes.
- `server/modules/users`: Users & Access commands and the first-admin bootstrap use-case.
- `server/modules/audit`: the only writer of `audit_events`, plus the admin read endpoint.
- `server/modules/<domain>`: `<domain>-routes.ts`, `<domain>-service.ts`,
  `<domain>-repository.ts`, plus pure domain rules (e.g. `project-lifecycle.ts`).
- `shared/schema.ts`: PostgreSQL schema only. `shared/contracts`: Zod request/response contracts.
- `client/src/features/<domain>`: API access and React Query hooks. `client/src/lib`: the API
  client and the shared mutation pattern.

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

Services are created by a factory (`createProjectService({ db })`, `createUserService({ db })`,
`createAuthService({ db })`) and receive their dependencies explicitly. There are no
module-scope singletons holding connections. CPU-heavy work that does not need the transaction
(password hashing) happens before it.

## Authentication

The Vault is closed: nobody signs up, and there is no third-party identity provider. Accounts
come from the operator bootstrap and from studio administrators. Everything below lives in
`server/modules/auth` and is exercised end to end by the integration and browser tests.

### Tables

| Table | Holds | Never holds |
| --- | --- | --- |
| `application_users` | id, email (unique, case-insensitive), display name, role, status, version | credentials, sessions |
| `user_credentials` | one row per user: self-describing password hash, `password_changed_at` | plain text |
| `auth_sessions` | SHA-256 of the session token, user, created/expires/last-seen/revoked | the token itself |

Both child tables reference `application_users` with `ON DELETE CASCADE`; a user's credential
and sessions have no meaning without the user.

### Passwords

scrypt from Node's crypto module: `N=2^16, r=8, p=2`, 16-byte random salt, 32-byte key,
64 MiB per hash, input normalised to NFKC. Stored as `scrypt$N$r$p$salt$hash`. Because the
parameters travel with the hash, `needsRehash` can raise them and the next successful login
rehashes. Minimum length 12 (`passwordSchema` in shared contracts). Chosen over Argon2id for
zero native dependencies and identical behaviour on every host; an Argon2id implementation
would add a new prefix and reuse the same verify path.

### Sessions and cookie

Login generates 32 random bytes (base64url) and stores only their SHA-256. The browser holds the
token in `vault_session`: `HttpOnly; SameSite=Lax; Path=/; Max-Age=7 days`, plus `Secure` in
production. Absolute lifetime 7 days, idle timeout 24 hours, `last_seen_at` written at most
every 5 minutes. Login retires whatever session the browser was carrying (rotation), logout
revokes, suspension revokes every live session of the user. Nothing is stored in browser
storage; the client only asks `/auth/me`.

### Request lifecycle

```
POST /auth/login   loginSchema → findByEmail → verify hash (dummy hash when unknown, so timing
                   matches) → refuse suspended (403) → rotate + insert session + audit → cookie
any /api request   cookie → hash → session live? (not revoked, not expired, not idle)
                   → user still active? → req.localUser   else 401 (or 403 ACCOUNT_SUSPENDED)
POST /auth/logout  revoke + audit, clear cookie (idempotent)
GET  /auth/me      the safe LocalUser contract
```

Wrong password and unknown email produce the same response and the same cost. Login failures
are logged with the request ID only. Login is rate limited per client IP on failed attempts.

### CSRF and origin

The `SameSite=Lax` cookie plus `mutationOriginGuard` on every `POST/PUT/PATCH/DELETE`: a
`Sec-Fetch-Site: cross-site` request is refused; an `Origin` that is not one of this
deployment's hosts (HTTPS in production) is refused; in production a missing `Origin` is
refused. In development a missing `Origin` is tolerated so command-line clients and Supertest
work, while a wrong origin is still refused.

### Roles and access

Roles are `studio_admin` and `user`, nothing finer. `requireLocalUser` resolves the session on
every request; `requireStudioAdmin` guards administrative and lifecycle commands. Nothing on the
client is a security boundary: `useIsStudioAdmin()` only hides navigation and actions.

### Accounts

- **Bootstrap** (`npm run bootstrap:admin`): explicit operator command, never an HTTP route,
  reading `VAULT_BOOTSTRAP_ADMIN_EMAIL/PASSWORD/NAME`. Creates the first active studio_admin,
  its credential and the audit event in one transaction. Idempotent; refuses to modify an
  existing Vault user.
- **Provisioning** (`POST /api/v1/users`): a studio_admin supplies name, email, initial password
  and role. The service hashes the password, then inserts user, credential and audit event in
  one transaction. Duplicate emails are refused (case-insensitive).
- **Commands**: change role, suspend (revokes sessions), reinstate. Each is versioned and
  audited. A user cannot demote or suspend themself; the last active studio_admin cannot be
  demoted or suspended.

### Extension point

Email one-time-code MFA and password reset sit between "verify hash" and "issue session" in
`auth-service.ts`: a pending-challenge record, an email sender, and a completing endpoint that
calls the same session issuance. The user, credential and session tables do not change. Not
built; documented so it is built in the right place.

## Authorship and roles

Every durable record carries `created_by_user_id`. Ordinary users manage their own authored
records where a domain permits; studio_admin manages everything; lifecycle and administrative
commands are studio_admin-only unless a domain records a different decision. Services resolve
actors for display. See ADR 0006.

## HTTP boundary

- `requestId` is the first middleware, so every rejection (including untrusted hosts) carries a
  real request ID.
- Request input is parsed with `validate(schema, value)`; a failure is `400 VALIDATION_ERROR`
  with field details. A `ZodError` anywhere else (for example a response contract check) is a
  server bug and surfaces as `500`, logged as `RESPONSE_CONTRACT_VIOLATION`.
- Body-parser failures map to `400 INVALID_JSON`, `413 PAYLOAD_TOO_LARGE`, `415 …`.
- Async routes are wrapped with `handle(async (req, res) => …)`; no per-route try/catch.
- Every error response is `{ error: { code, message, details?, requestId } }`.

### Rate limits

Per client IP and per process (in-memory; an autoscaled deployment multiplies them by its
instance count, which is acceptable until a shared store is justified):

| Family | Scope | Budget |
| --- | --- | --- |
| read | `GET`/`HEAD` under `/api` | 600 per minute |
| write | other methods under `/api` | 120 per minute |
| login | failed `POST /api/v1/auth/login` attempts | 10 per minute |
| provisioning | non-read requests under `/api/v1/users` | 20 per minute |

## Workspace server-state pattern

`ProjectWorkspaceProvider` loads the project once and exposes it through
`useProjectWorkspace()` as the server-authoritative `Project` from `shared/contracts`, together
with the caller's admin flag. Navigation is static configuration
(`features/projects/workspace-navigation.ts`), not data. Each migrated domain view fetches its
own state with its own hook keyed by `project.id`; there is deliberately no aggregate "workspace"
query. Screens that are not yet migrated are isolated in one bridge component that adapts the
API project to the prototype shape; each domain migration removes its screen from that bridge.

## Mutation conflict pattern

All mutations use `useVaultMutation` (`client/src/lib/mutations.ts`): invalidate the affected
query keys on success, refetch them when the server answers `409` (stale version or a state rule)
so the user sees current data, and show one toast per outcome. Components that need to react
(keep a dialog open, navigate) await `mutateAsync` and catch; they do not add their own toasts.
Login is the one exception: its errors are shown inline by the form.

## Projects reference domain

Projects persist core identity, metadata, active stage, archive metadata, optimistic `version`,
and soft deletion timestamp. Stage change, archive, restore, and delete are explicit operations.
Each state transition and audit event is committed in the same transaction. Deletion is soft to
retain provenance; it is hidden from all product reads and writes. Lists are cursor-paginated
and fetch one extra row so `nextCursor` is set only when more rows exist.

Users & Access is the second reference domain and follows the same shape.

## Database conventions

Use PostgreSQL UUID keys, UTC `timestamptz`, foreign keys, indexes for actual access paths and
explicit constraints. Money is `numeric(14,2)` with decimal strings in contracts; date-only
values are `date` columns (ADR 0006). Use migrations under `migrations/`; never run DDL at
application startup. Changes that update records and audit/stage history use one transaction.
Use optimistic versions for user edits and return `409 VERSION_CONFLICT` rather than losing
changes.

## Attachments

Files are not implemented yet. When they are, one `documents` domain owns every file reference:
immutable `file_objects` with random non-public keys, an enum-constrained attachment target
validated by the documents service, and explicit version chains. No domain introduces its own
document table or stores file paths (ADR 0006).

## Test-environment safety

`createDatabase` refuses to bind the application pool to any database not named `vault_test_*`
when `NODE_ENV=test`. Test setup creates a disposable `vault_test_<uuid>` database, migrates it
with the checked-in migrations, seeds one studio_admin and one ordinary user through the real
bootstrap and provisioning use-cases, and drops it afterwards; Playwright drops its database
from a global teardown because the web server process is killed without hooks. Tests never
mutate `process.env` to point the app at a database: they pass an explicit `Environment` and
`db`. Tests authenticate through the real login endpoint; there is no identity seam.

## Security and observability

API errors have a stable envelope and request ID. JSON logs contain event names, request IDs,
method/path/status and duration only; the logger redacts cookies, authorization, secrets, tokens,
passwords and database URLs. Helmet, body limits and API rate limiting are baseline controls.
There is no permissive CORS policy: browser access is same-origin.

`/api/v1/health` is process health; `/api/v1/ready` verifies database reachability.

## How to add a domain

1. Add a focused schema migration and update `shared/schema.ts`.
2. Define Zod API contracts before routes.
3. Add `<domain>-repository.ts` (executor-taking query functions, narrow input types),
   `<domain>-service.ts` (`create<Domain>Service({ db })`, one `withTransaction` per command,
   `appendAuditEvent` inside it) and `<domain>-routes.ts` (`validate`, role guard, `handle`).
4. Mount the router in `server/routes.ts` behind `requireLocalUser` and construct the service in
   `server/app.ts`.
5. Add a typed client API module and React Query hooks built on `useVaultMutation`.
6. Add tests: unit for pure rules, integration against the disposable database for policy,
   constraints, concurrency, authorization (admin and user) and audit rows, and a browser check
   for the UI path.

Avoid raw `fetch` in components, UI state as a source of truth for server records,
feature-specific data in the Project core table, repositories that open transactions, audit
inserts outside `server/modules/audit`, and any authentication path outside
`server/modules/auth`. Do not reintroduce an external identity provider.
