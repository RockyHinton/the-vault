# Database migrations

The schema lives in `shared/schema.ts`; migrations under `migrations/` are the only way it
reaches a database. Never run DDL at application startup, never `drizzle-kit push`, never
rewrite a migration that has been applied anywhere.

1. Edit `shared/schema.ts`.
2. `npm run db:generate`, then rename the generated file to `00NN_<meaningful-tag>.sql` and
   update the matching `tag` in `migrations/meta/_journal.json`. Keep the
   `--> statement-breakpoint` markers.
3. Review the SQL. Generated statements do not know about existing CHECK constraints: when a
   column changes type (for example text to enum), drop and re-create the constraint around
   the `ALTER COLUMN` (see `migrations/0014_hardening_phase_1.sql`).
4. `npm run db:migrate` against the development database, then `npx drizzle-kit check` and
   `npm run db:generate` again to confirm "no schema changes".
5. Commit schema, migration and snapshot together.

Every test run replays all migrations onto an empty `vault_test_*` database, which is the
from-empty proof. For a release an authorized operator runs `drizzle-kit migrate` against the
instance database before serving the new build.

Conventions worth repeating: UUID keys; `timestamptz`; `date` for date-only values;
`numeric(14,2)` for money; foreign keys with deliberate delete behaviour (`restrict` for
anything historical, `cascade` only for pure children of a non-historical parent); CHECKs for
positive versions, non-blank names and status↔timestamp pairs; partial unique indexes for
"one open" or "one current" rules and case-insensitive names. When you add a `pgEnum`, add it
to the enum parity test (or its server-internal allowlist) or the unit suite fails.
