# Testing

```
tests/unit          pure rules: money, dates, projections, enum parity, logger, safety guards
tests/api           HTTP boundary through the real middleware stack, no database
tests/storage       the FileStorage contract suite, run against the local adapter
tests/integration   Supertest against a real, disposable PostgreSQL database (one per suite)
tests/e2e           Playwright against the real app on a disposable database
```

`npm test` runs Vitest (unit, api, storage, integration, serially); `npm run test:e2e` runs
Playwright. Both need a PostgreSQL user that can `CREATE DATABASE`; the browser suite needs
`npx playwright install chromium` once.

## Safety

- `tests/support/isolated-postgres.ts` creates `vault_test_<uuid>` from `DATABASE_URL`,
  replays the checked-in migrations with `drizzle-kit migrate`, and drops it afterwards.
  Independently, `createDatabase` refuses to bind the application pool to any database not
  named `vault_test_*` under `NODE_ENV=test`, and the local storage adapter refuses any root
  not named `vault_test_storage_*`. Tests cannot reach development data regardless of order.
- Each created database leaves a marker under `test-results/test-databases/`; a run that
  crashes before teardown leaves it behind, and the next run's global setup drops only marked,
  idle, `vault_test_*` databases older than ten minutes. Nothing else is ever listed or dropped.
- Playwright runs with one worker, in order: every spec shares one server, one database and
  the two seeded accounts. The test server raises only the read and write rate budgets through
  the `rateLimits` option because every spec shares one loopback address; production defaults
  are untouched.
- Tests never mutate `process.env` to point the app at a database: `createTestContext()` passes
  an explicit environment and pool, seeds `admin@vault.test` and `member@vault.test` through
  the real bootstrap and provisioning use-cases, and `loginAs` signs in through the real
  endpoint. There is no identity bypass.

## What a domain suite proves

Invariants, not CRUD: creation captures the session actor (send a spoofed `createdBy` and
assert it was ignored); an id from project A through project B's routes is 404; admin and
ordinary user paths; each lifecycle command; a stale `version` is 409 with no side effects
and no audit row; constraint violations through raw SQL name the constraint; audit rows exist
after success and are absent after failure; documents attach by lineage and follow versions;
money is exact at both `0.10 + 0.20` and twelve-digit extremes; a second user sees the same
state. `tests/integration/people-postgres.test.ts` is the reference suite;
`hardening-invariants-postgres.test.ts` and `scoping-and-history-postgres.test.ts` hold
cross-domain invariants (version ownership, script deletion, races, rebase orphan semantics).

## Where to add a test when you introduce

| Change | Test |
| --- | --- |
| a new `pgEnum` | `tests/unit/contract-enum-parity.test.ts` (parity assertion or the server-internal allowlist; the inventory check fails otherwise) |
| a new migration | nothing extra: every suite replays it from empty; add a raw-SQL constraint test for each new CHECK or unique index |
| a new database invariant | the domain's integration suite, through raw SQL expecting the named constraint |
| a new cross-project relationship | a 404 for the foreign id and a 422 for a same-project record in the wrong state, in the owning domain's suite |
| a new audit action | assert it appears after the command and not after a refused one |
| a document owner | `tests/unit/document-owner-keys.test.ts` and an attach/detach test in the suite |
| a browser flow | one representative Playwright spec per domain; keep invariants in integration tests |
