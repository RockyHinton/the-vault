# Engineering standards

The Vault is long-lived commercial software for film production companies, built and
extended by people and coding agents for years. These are the permanent standards every
change is held to. The architecture guides in `docs/architecture/` say *how* each rule is
implemented; this page says *what* must stay true.

## Principles

- **Explicit and boring beats clever.** Prefer the design that is easiest to reason about,
  has the clearest ownership, hides the fewest side effects and is hardest to misuse.
- **Low cognitive overhead.** A new agent should open any domain and find the same shape:
  where rules live, where persistence lives, how transactions, authorization, concurrency,
  audit and tests work.
- **One established pattern per problem.** Reuse it; introduce a new reusable pattern only
  when nothing existing fits, then document it and give it one canonical implementation.
- **Precise names.** No `data`, `helper`, `manager`, `utils`, `common` unless the abstraction
  genuinely is that. Focused files and functions, neither giant modules nor needless
  fragmentation.
- **Comments explain invariants, security and concurrency reasoning, provider limits and
  deliberate trade-offs,** never obvious syntax.

## Architecture

- **One modular monolith, one production company per deployment.** Another company gets
  another isolated deployment with its own database, file store, users and secrets. There is
  no tenant, organisation or per-project ACL concept, and none is added speculatively.
- **Layering and dependency direction:** shared Zod contract → Drizzle schema → migration →
  repository → service → route → typed client API → React Query → UI. Routes adapt HTTP and
  call services; they never call repositories or hold business rules. Repositories take an
  executor, persist and scope, and hold no policy. Services own policy, the transaction and
  the audit event. Contracts never expose database rows.
- **Cross-domain work:** inside a transaction, read another domain through its repository;
  outside one, compose services. Writing another domain's tables is allowed only through a
  write primitive that domain exports for that purpose (see
  [transactions-concurrency-audit.md](architecture/transactions-concurrency-audit.md)).
- **Provider portability:** provider-specific code stays behind `server/config`,
  `server/files` and the build scripts. Nothing in domain modules, shared contracts or the
  client names a hosting provider.

## TypeScript

Strict types throughout: narrow input types, discriminated unions, exhaustive handling,
explicit return types where they help, enums declared once in contracts and mirrored in
PostgreSQL with a parity test. No `any`, no unchecked or broad casts, no `Partial<Row>`
persistence APIs (editable fields are `Partial<Pick<Row, …>>`), no weakened types to make
compilation pass.

## Database

PostgreSQL is an integrity boundary, not passive storage: foreign keys with deliberate delete
behaviour, CHECKs, NOT NULL, unique and partial unique indexes for real business rules, and
indexes that match real queries. Migrations are generated, reviewed, deterministic, safe from
an empty database, and never rewritten once applied. Money is `numeric(14,2)`; dates without
time are `date`; timestamps are `timestamptz`.

## Domain behaviour

- **Commands, not generic edits.** Lifecycle and status changes are explicit commands
  (`submit`, `lock`, `approve`, `archive`, `complete`, `…/status`). Update schemas list only
  editable fields; nothing a PATCH sends can change lifecycle state.
- **Authorization is server-side**, in services: two roles (`studio_admin`, `user`),
  studio-wide visibility, ownership rules per command, `requireStudioAdmin` only for wholly
  administrative endpoints. Hidden buttons are never authorization. Identity comes from the
  session, never the request body.
- **Transactions:** one service-owned unit of work per command. Commands in project-owned
  domains use `withLiveProjectTransaction`, so a soft-deleted project accepts no writes.
- **Optimistic concurrency:** every editable aggregate and independently edited child carries
  `version`; a stale write is `409` with no side effects. Row locks and named unique
  constraints serialise real races; the concurrent loser gets the same stable conflict,
  never a `500`.
- **Audit:** every meaningful command appends one typed event inside its transaction, with
  the session actor and useful non-sensitive metadata; failed or refused commands leave none.
- **Errors** use the `{ error: { code, message, details?, requestId } }` envelope with stable
  codes; internal details never leave the process.

## Files, documents and scripts

Bytes live only behind `FileStorage`; document rows only through the Documents domain; owners
attach by document lineage through the shared attachment repository; document status belongs
to Documents. There is never a second upload path. A script is a stable identity over a
document lineage, and anything that analyses a script references the exact document version.

## Money

Authoritative financial values are exact: `numeric(14,2)` in PostgreSQL, decimal strings on
the wire, BigInt cents in the shared calculations (`summarizeFinancing`, `projectCashFlow`),
computed on the server and never stored as totals. JavaScript floating point never determines
a financial value. The client renders the server's figures; exact helpers
(`formatMoney`, `groupMoney`) may reformat them, and `Number` is permitted only for chart
geometry.

## Frontend

React Query owns server state through one feature module per domain (typed API, query keys,
hooks); local component state owns only drafts and view state; there is no global client
store for server data and no raw `fetch` in components. Loading, error, not-found and empty
are distinct states: only a successful response proves "nothing here", and only the server's
`404` proves "not found". Business rules stay on the server.

## Security

Fail closed. Never expose secrets, credentials, storage keys or raw internal errors; never
trust browser-supplied identity, ownership, filenames or paths; keep host, origin and session
guards intact; treat every record as potentially confidential (contracts, rights, finance,
personal data).

## Testing

Tests protect invariants, not coverage numbers: authorization, scoping, transaction
atomicity, real concurrency (actual concurrent transactions, not sequential requests),
database constraints, failure paths with no side effects or audit events, exact money,
cross-user behaviour. Persistence behaviour runs against real disposable PostgreSQL;
Playwright stays small and representative. A discovered bug gets a regression test.

## Documentation

Update the focused guide when a durable rule changes, in the same change. Add an ADR only for
a genuinely new decision; amend an existing ADR with a dated note rather than rewriting it.
Documentation that contradicts the code is a defect.

## Working rules

Inspect the existing implementation before changing it; make narrow, deliberate changes;
run the gates listed in `CLAUDE.md`; never commit or push unless explicitly instructed.

Before finishing, ask: **if the next five domains copied this implementation, would the
codebase become better?** If not, improve it first. The target is simple, explicit, secure,
well-tested and easy to extend, not maximal abstraction.
