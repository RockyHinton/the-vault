# Architecture overview

The Vault is a film-production operating system for **one production company per
deployment**. This repository is the canonical product; each client company runs its own
isolated instance of it (see [deployment-model.md](deployment-model.md)). There is no
tenant layer anywhere in the code, and none should be added.

## Shape

One TypeScript modular monolith: a React/Vite client served by an Express process that owns
all PostgreSQL access and all file bytes.

```
CLIENT       React page → feature hook (React Query) → typed API function
                 │  shared Zod contracts are the HTTP boundary (never database rows)
SERVER       Express route (validate, guard) → service / use-case (policy, transaction)
                 → repository (queries on the executor it was given)
                 → audit repository (same executor)
PERSISTENCE  PostgreSQL (Drizzle) · private file bytes behind the FileStorage adapter
```

Dependencies point downwards only. A route never calls a repository; a repository never
imports a service; a service never imports another domain's service (it may read another
domain's repository inside its own transaction, see
[transactions-concurrency-audit.md](transactions-concurrency-audit.md)). The client
never reaches PostgreSQL, file storage or another domain's tables.

## Why a monolith, why not multi-tenant

- **Modular monolith** (ADR 0001): one deployable process, domains separated by module
  boundaries rather than network boundaries. There is one database per instance, one
  transaction model, one audit trail, and no distributed failure modes to reason about.
  Microservices would multiply operational surface without a corresponding product need.
- **One company per instance:** every active user belongs to the studio that owns the
  deployment and sees every project. Isolation between companies is achieved by separate
  deployments, databases and stores, never by a tenant column. Per-project membership does
  not exist and is not a planned feature.

## Cross-cutting concerns

| Concern | Where it lives | Guide |
| --- | --- | --- |
| Authentication (first-party passwords, opaque hashed sessions) | `server/modules/auth` | [auth-and-authorization.md](auth-and-authorization.md) |
| Authorization (two roles, server-side policy in services) | each `*-service.ts`, `requireStudioAdmin` | [auth-and-authorization.md](auth-and-authorization.md) |
| Transactions, optimistic concurrency, audit | services; `server/modules/audit` | [transactions-concurrency-audit.md](transactions-concurrency-audit.md) |
| Errors and request IDs | `server/http` | [domain-pattern.md](domain-pattern.md#http-boundary) |
| Files and documents | `server/files`, `server/modules/files`, `server/modules/documents` | [files-and-documents.md](files-and-documents.md) |
| Money and finance provenance | `shared/contracts/money.ts`, Finance modules | [finance.md](finance.md) |
| Client server-state | `client/src/features/*` | [frontend-state.md](frontend-state.md) |

## Module map

```
client/src/features/<domain>/   typed API, query keys, React Query hooks, labels
client/src/components/          UI (validated product screens); components/forms, components/documents are shared
client/src/pages/               routes: sign-in, projects, project workspace, admin, script reader
shared/contracts/               Zod request/response contracts, money and date rules, pure calculations
shared/schema.ts                the PostgreSQL schema (Drizzle); nothing else
server/app.ts                   composition root: middleware order, services, router, error handler
server/routes.ts                mounts every domain router under /api/v1 behind requireLocalUser
server/http/                    request ID, host/origin guards, validate, handle, error envelope
server/db/                      pool with test guard, withTransaction, unique-violation mapping
server/files/                   FileStorage interface, local adapter, provider factory
server/modules/<domain>/        <domain>-routes.ts, <domain>-service.ts, <domain>-repository.ts
migrations/                     generated, reviewed, never rewritten
tests/                          unit, api, storage, integration (disposable PostgreSQL), e2e (Playwright)
docs/                           this architecture set, development guides, ADRs
```

Domains today: auth, users, audit, projects, files, documents, evaluation (with reviews),
notes, tasks, people, rights, legal, scripts, budget, finance-plan, cash-flow,
financing-overview (read model), stage-readiness (read model), distribution. Per-domain rules that are not covered by a
dedicated guide are in [domain-reference.md](domain-reference.md).

## Source-of-truth rules

| What | Authoritative representation |
| --- | --- |
| Business state | PostgreSQL |
| File bytes | the `FileStorage` provider, addressed only by a random key stored in `file_objects` |
| Document versioning | the Documents domain (`documents` lineage rows) |
| Script versioning | Documents; the script row is stable identity only |
| Money | `numeric(14,2)` in PostgreSQL, decimal strings on the wire, BigInt cents in calculations |
| Server state on the client | React Query caches keyed by feature |
| Unsaved UI state | local React state in the component or form |
| Authorization | service code, plus `requireStudioAdmin` for whole-endpoint administration |
| Transactions | the service layer, one `withTransaction` per command |
| Audit vocabulary | `server/modules/audit/audit-actions.ts` |
| Architectural guidance | `docs/architecture` (entered through `CLAUDE.md`) |
| Historical decisions | `docs/decisions` (ADRs) |

When two representations could disagree, the one in this table wins and the other is
derived from it.
