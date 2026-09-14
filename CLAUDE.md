# The Vault — coding agent entry point

You are the primary coding architect for The Vault: a film-production operating system,
built and maintained as long-lived commercial software by people and coding agents. Treat
every change as production infrastructure that will be extended for years.

## What it is, and how it is deployed

One TypeScript modular monolith (React/Vite client, Express server, PostgreSQL, private file
storage behind an adapter). **One production company per deployment**: each client company
gets its own isolated instance of this repository with its own database, file store, users,
projects and secrets. There is no tenant layer and none may be added. "Deploy for another
company" means another isolated instance, never another row.

## Read these first

@docs/architecture/overview.md
@docs/architecture/domain-pattern.md

Then, as the task needs them: `docs/architecture/` (auth-and-authorization,
files-and-documents, frontend-state, transactions-concurrency-audit, finance,
scripts-and-provenance, deployment-model, domain-reference), `docs/development/`
(local-setup, testing, adding-a-domain, database-migrations), `docs/decisions/` (ADRs; the
index lists what is current), and `docs/ENGINEERING_STANDARDS.md`.

## Rules that do not bend

- Layering: shared Zod contract → Drizzle schema → migration → repository → service (owns the
  transaction and the policy) → audit → route → typed client API → React Query → UI.
- Services own transactions; repositories take the executor and hold no policy; routes call
  services, never repositories, and hold no business rules; contracts never expose database rows.
- Project-owned commands open `withLiveProjectTransaction` (a soft-deleted project accepts no
  writes). Another domain's tables are written only through its sanctioned write primitives
  (listed in transactions-concurrency-audit).
- Authorization is server-side: two roles (`studio_admin`, `user`), studio-wide visibility,
  ownership rules per command, `requireStudioAdmin` only for whole-endpoint administration.
- Every editable aggregate has an optimistic `version`; stale writes are 409 with no side
  effects; row locks and named unique constraints serialise real races.
- Every meaningful command appends one typed audit event inside its transaction; none on failure.
- Files and Documents are the only file architecture: bytes behind `FileStorage`, documents
  with lineages, owners attach by lineage, status owned by Documents. Never a second upload path.
- Money is `numeric(14,2)`, decimal strings on the wire, BigInt cents in calculations; never
  a float, never a stored total.
- Scripts are stable identities over Document lineages; anything that analyses a script
  references the exact document version.
- Client: React Query owns server state, local state owns drafts, no global store; errors are
  not empty states; conflicts reconcile to the server's value.
- PostgreSQL enforces invariants where it can: FKs, CHECKs, unique and partial indexes.
- Provider-specific code stays behind `server/config`, `server/files` and the build scripts.

## Anti-patterns to refuse

Generic base repositories or CRUD frameworks, event buses, workflow engines, microservices,
tenant or organisation concepts, per-project ACLs, external identity providers, MFA or
password reset added in passing, a client store for server state, fixture or fabricated
business data in the UI, a stored total or gap, a rewritten migration, `any`, a raw `fetch`
in a component.

## Working method

Inspect the existing implementation before changing architecture; reuse the established
pattern (People is the reference domain); make deliberate, narrow changes; write the
integration test that proves the invariant; update the focused doc when a durable rule
changes. Before finishing ask: *if the next five domains copied this, would the codebase be
better?*

## Gates

`npm run check`, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:e2e`
where behaviour is user-facing, `npm run build`, `git diff --check`, `npx drizzle-kit check`
after schema changes. **Do not commit or push unless explicitly instructed.**
