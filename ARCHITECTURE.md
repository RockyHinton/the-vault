# Architecture

## Shape

The Vault is a TypeScript modular monolith: React/Vite is served by an Express process, which
exposes `/api/v1` and owns PostgreSQL access. A deployment is for one studio; there is no
application multi-tenancy.

```
React page/component → feature hook → typed API client → Express route
→ authentication/authorization → application service → repository → Drizzle → PostgreSQL
```

Routes are deliberately thin. Services own policy and lifecycle rules. Repositories own queries
and transactions. Shared Zod contracts (`shared/contracts`) are public API shapes, never Drizzle
rows. Do not add generic repository/service base classes or cross-domain imports.

## Modules

- `server/config`: typed server environment validation.
- `server/http`: request ID, safe errors, request logging.
- `server/middlewares`: provider-specific Clerk proxy only.
- `server/modules/<domain>`: focused routes, service, repository and domain rules.
- `server/db`: Drizzle connection lifecycle.
- `shared/schema.ts`: PostgreSQL schema only.
- `shared/contracts`: Zod request/response contracts.
- `client/src/features/<domain>`: API access and React Query hooks.

## Authentication and access

Clerk proves browser identity using its cookie session. The application never sends browser bearer
tokens. Express verifies the cookie through Clerk middleware, then `requireLocalUser` resolves
`application_users`. Only active local users proceed; `studio_admin` guards project writes.

No public just-in-time access exists. The only automatic insertion is a one-time operator bootstrap
when the authenticated Clerk user ID exactly equals `VAULT_BOOTSTRAP_ADMIN_CLERK_ID`. Until a user
management domain is built, additional access provisioning is intentionally deferred rather than
exposed through a public automatic-access path.

## Projects reference domain

Projects persist core identity, metadata, active stage, archive metadata, optimistic `version`, and
soft deletion timestamp. Stage change, archive, restore, and delete are explicit operations. Each
state transition and audit event is committed in the same transaction. Deletion is soft to retain
provenance; it is hidden from all product reads.

The frontend maps the API project to the legacy workspace shape in
`project-fixture-adapter.ts`. The adapter is an intentional boundary: server core data is
authoritative, while finance, scripts, rights, documents, people and other feature fixture state
is not persisted and must not be mistaken for production data.

## Database conventions

Use PostgreSQL UUID keys, UTC `timestamptz`, foreign keys, indexes for actual access paths and
explicit constraints. Use migrations under `migrations/`; never run DDL at application startup.
Changes that update records and audit/stage history use one transaction. Use optimistic versions
for user edits and return `409 VERSION_CONFLICT` rather than losing changes.

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
3. Add domain repository/service/routes; enforce authorization in routes and policy in service.
4. Add transactional audit events for meaningful security/workflow operations.
5. Add a typed client API module and React Query hooks.
6. Add tests for validation, policy, constraints and UI behavior.

Avoid raw `fetch` in components, provider SDK use outside adapters, UI state as a source of truth
for server records, and feature-specific data in the Project core table.