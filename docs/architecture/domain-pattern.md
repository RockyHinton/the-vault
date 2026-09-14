# The canonical domain pattern

Every Vault domain is built the same way. Copy this shape; do not invent a new one.

```
shared/contracts/api.ts          Zod contracts: the API shape, never a database row
        ↓
shared/schema.ts                 Drizzle tables, enums, CHECKs, unique and partial indexes
        ↓
migrations/00NN_<tag>.sql        generated, renamed, reviewed, never rewritten
        ↓
server/modules/<d>/<d>-repository.ts   queries only, executor supplied by the caller
        ↓
server/modules/<d>/<d>-service.ts      policy + one transaction per command + audit
        ↓
server/modules/<d>/<d>-routes.ts       validate → authorize → call service → envelope
        ↓  mounted in server/routes.ts, constructed in server/app.ts
client/src/features/<d>/<d>-api.ts     typed API functions over apiClient
client/src/features/<d>/use-<d>.ts     query keys, useQuery hooks, useVaultMutation hooks
        ↓
client/src/components/...              validated UI reading hooks, holding only drafts
```

## Responsibilities at each boundary

**Contracts** (`shared/contracts`). Request schemas are narrow: a create schema, an update
schema with `version` and "at least one field" refinement, a command schema per lifecycle
step (`status`, `approve`, `lock`), param schemas. Response schemas describe what the server
returns, including `UserRef` actors (`{ id, displayName }`, never email) and embedded
`Document`s. Enums are declared once here and mirrored as `pgEnum`s; the parity test fails
when they drift.

**Schema** (`shared/schema.ts`). UUID keys, `timestamptz`, `date` for date-only values,
`numeric(14,2)` for money, foreign keys with deliberate delete behaviour (`restrict` for
anything historical), CHECK constraints for shape rules (positive version, non-blank names,
status↔timestamp pairs), unique indexes for real business rules (one per project,
case-insensitive names, one open version). See
[../development/database-migrations.md](../development/database-migrations.md).

**Repositories.** Functions that take `DatabaseExecutor` (reads) or `Transaction` (writes)
as their first argument and return rows or `undefined`. They scope every lookup by project
(join to the owning table when the row has no `project_id`), filter soft-deleted rows, and
write compare-and-set updates (`id` + expected `version`). They contain no policy, no audit
vocabulary and never open a transaction. Editable-field types are `Partial<Pick<Row, …>>`,
never `Partial<$inferInsert>`.

**Services.** `create<Domain>Service({ db })`. Each command: open `withTransaction` (for a
project-owned domain, `withLiveProjectTransaction(db, projectId, …)`, which refuses a
soft-deleted project before any write; see
[transactions-concurrency-audit.md](transactions-concurrency-audit.md)), load
and scope the record (`require<X>` → 404), check policy (`assertCan*` → 403, state rules →
409/422), write through the repository (`requireFresh` → 409 `VERSION_CONFLICT`), append
the audit event with the same `tx`, and return the contract shape (`to<Contract>`). Services
own cross-domain reads (see the read rule) and are the only place product rules live.

**Routes.** `Router({ mergeParams: true })`, `validate(schema, req.params | req.body)`,
`handle(async …)`, the actor built from `req.localUser` (never from the body), a call to the
domain's service (routes never receive the database or call a repository), and the
`{ data, requestId }` envelope. Status codes: `201` for creates; for deletes, `204` with no
body when the command removes the record the URL addresses (a project, person, note,
territory, document lineage, script), and `200` with the updated parent aggregate when it
removes a part of an aggregate the client re-renders whole (a budget department or line item,
a finance source, a cash-flow window, payment or timing, a territory note, a document link).
`requireStudioAdmin` is applied here only when the whole endpoint is administrative.

**Updates and lifecycle.** An update schema is a Zod object listing only the editable fields,
plus `version` and an "at least one field" refinement. Zod strips keys a schema does not
declare, so a `status` (or any other undeclared key) sent to a PATCH is silently ignored; a
body with nothing editable besides it is `400 VALIDATION_ERROR`. Status and lifecycle change
only through explicit commands (`…/status`, `…/complete`, `…/approve`, `…/lock`), each with its
own audit event. The one generic PATCH that does carry a status is the Documents metadata
edit, because document status is the Documents domain's own field.

**Client.** A feature module owns its typed API, its query keys and its hooks. Components
read hooks and keep unsaved drafts in local state. See [frontend-state.md](frontend-state.md).

## What does not belong where

- Business rules in routes, repositories or React components.
- A repository that opens a transaction, checks a role, or knows an audit action name.
- A contract that re-exports a Drizzle row type, or a response that carries a storage key,
  an email (outside admin contracts) or a raw error.
- Generic base repositories, CRUD frameworks, event buses, workflow engines, tenant columns,
  per-project ACLs, or a second upload path.
- Server state duplicated in a client store.

## Reference implementations

- **People** (`server/modules/people`) is the compact reference for a normal project
  domain: a project-scoped aggregate with typed JSONB sub-records, an explicit status
  command, creator-or-admin removal, documents attached by lineage, and a full integration
  suite. Read it first when adding a domain.
- **Projects** is the reference for lifecycle commands with stage history; **Tasks** for
  assignment and collaborative commands; **Documents** for the shared write primitive that
  other domains call inside their own transaction; **Budget** for row locks and copy-forward
  revisions; **Finance Plan** and **Cash Flow** for exact provenance to another domain's
  immutable record; **Financing Overview** for a read model composed from services.

## HTTP boundary

- `requestId` is the first middleware; every response, including rate-limit refusals,
  carries it.
- `validate` failures are `400 VALIDATION_ERROR` with field details. A `ZodError` anywhere
  else is a server bug, logged as `RESPONSE_CONTRACT_VIOLATION` and returned as an opaque 500.
- Body-parser failures map to `400 INVALID_JSON`, `413 PAYLOAD_TOO_LARGE`, `415 …`.
- Every error is `{ error: { code, message, details?, requestId } }`; internal messages and
  stacks never leave the process.
- Status codes: 401 unauthenticated, 403 policy, 404 not found or not in this project,
  **409** the target record's own state (stale version, already locked, already approved,
  name taken), **422** an input that references another record in the wrong state
  (unlocked budget version, unapproved source, unsupported script format), 502 missing bytes.
- Rate limits per client IP, per process: read 600/min, write 120/min, failed logins 10/min,
  user provisioning 20/min. Only the browser test harness overrides them.
