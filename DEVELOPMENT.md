# Development

Local development is the primary engineering environment. GitHub is the source of truth.
Replit is the current deployment target (hosting and PostgreSQL); it is a provider, not part of
the architecture, and nothing below should make the code depend on it. Authentication is
first-party: no external service, no email, no verification code (ADR 0007).

## Commands

```bash
npm install
npm run dev              # Express + Vite on PORT (5000 default, 5001 locally via .env.local)
npm run check            # TypeScript (client, shared, server, tests)
npm run lint             # ESLint (server, shared, client features, tests)
npm run format:check     # Prettier (same scope); `npm run format` fixes
npm test                 # Vitest: unit, API boundary, PostgreSQL integration
npm run test:e2e         # Playwright browser tests (real login flow)
npm run build            # Vite client + esbuild server into dist/
npm run db:generate      # drizzle-kit generate (after editing shared/schema.ts)
npm run db:migrate       # drizzle-kit migrate against DATABASE_URL
npm run bootstrap:admin  # one-time first studio_admin (see below)
```

`npm run dev` must be the single command that serves the app; do not run `dev:client` alone.

## Environment

The server validates its environment at startup (`server/config/env.ts`). Outside production it
first loads `.env.local` from the repository root using Node's built-in env-file loader
(`server/config/load-env.ts`). Variables already present in the process always win, so Replit,
CI and shell exports override the file. Production never reads the file.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string. |
| `PORT` | no | Default 5000. Replit sets it in `.replit`; macOS reserves 5000, so `.env.local` uses 5001. |
| `VAULT_STORAGE_PROVIDER` | production | `local` (default outside production) or `replit`. Production must set it explicitly. |
| `VAULT_STORAGE_LOCAL_DIR` | no | Directory for `local` storage; default `.vault-data/files` (git-ignored). |
| `VAULT_MAX_UPLOAD_BYTES` | no | Upload limit, default 50 MiB. |
| `VAULT_BOOTSTRAP_ADMIN_EMAIL`, `_PASSWORD`, `_NAME` | bootstrap only | Read only by `npm run bootstrap:admin`. Never set them on a running web server. Remove the password after use. |
| `REPLIT_DOMAINS` | production | Comma-separated allowed hostnames (Replit sets it). |
| `REPLIT_DEV_DOMAIN` | no | Extra allowed host in development (Replit sets it). |
| `LOG_LEVEL` | no | `debug`, `info` (default), `warn`, `error`. |

`.env.example` lists these with placeholders. `.env.local` is git-ignored; never commit secrets.
There are no authentication keys: the Vault owns its credentials and sessions.

## First-time local setup

1. **PostgreSQL 16.** Any local instance works. With Docker:

   ```bash
   docker run --name vault-postgres -e POSTGRES_USER=vault -e POSTGRES_PASSWORD=change-me \
     -e POSTGRES_DB=vault_dev -p 5432:5432 -d postgres:16
   ```

   The database user must be able to `CREATE DATABASE`: tests create disposable databases.

2. **Create `.env.local`** from `.env.example` with `DATABASE_URL` and `PORT=5001`.

3. **Migrate:**

   ```bash
   npm run db:migrate
   ```

## First-admin bootstrap

A fresh database has no users, so nobody can sign in. The first studio_admin is created by an
explicit operator command, never by a web request:

1. Add to `.env.local` (or export in the shell):

   ```
   VAULT_BOOTSTRAP_ADMIN_EMAIL=you@example.com
   VAULT_BOOTSTRAP_ADMIN_PASSWORD=at-least-twelve-characters
   VAULT_BOOTSTRAP_ADMIN_NAME=Your Name
   ```

2. Run:

   ```bash
   npm run bootstrap:admin
   ```

   The command hashes the password, then inserts the user, its credential and a
   `user.bootstrap_admin_created` audit event in one transaction. Running it again is a no-op
   and never changes the password. It refuses to touch an existing Vault user with another role
   or status.

3. Remove `VAULT_BOOTSTRAP_ADMIN_PASSWORD` from `.env.local`.

4. `npm run dev`, open `http://localhost:5001`, sign in with the email and password.

On Replit the same command runs once in the deployment's shell with the three variables set as
protected secrets against the production `DATABASE_URL`; delete the password secret afterwards.

## Creating and managing users

Signed in as a studio_admin, open **Settings & Admin → Users** and choose **Add user**: name,
email, initial password (12+ characters) and role. The server hashes the password and creates
the user, its credential and the audit event together. Share the password with the person
directly; they sign in at `/` immediately. The same page changes roles, suspends and reinstates.
Suspending a user revokes every session they hold, so their next request is refused. You cannot
demote or suspend yourself, and the last active studio_admin cannot be demoted or suspended.
Until password reset ships, an administrator who needs to replace a password provisions a new
account or asks an operator; see ADR 0007.

## Sessions in development and production

The session cookie is `HttpOnly; SameSite=Lax; Path=/` with a 7-day absolute lifetime and a
24-hour idle timeout. In production it also carries `Secure`, so the deployment must terminate
HTTPS (Replit does). Locally the app runs over plain HTTP on localhost and the cookie is not
`Secure`; everything else is identical. Mutations must arrive with an `Origin` header naming the
deployment in production; in development a missing `Origin` is tolerated for command-line tools.

## File storage

Uploaded bytes never enter PostgreSQL. Locally they live under `.vault-data/files` (ignored by
git) through the `local` storage adapter; the database holds only metadata and a random key.
To reset local files, stop the app and delete that directory together with the `file_objects`
and `documents` rows, or leave them: a missing object is reported as unavailable, never as
missing metadata. Tests use a temporary `vault_test_storage_*` directory that is removed
afterwards; the adapter refuses any other root under `NODE_ENV=test`, so tests cannot touch
your real uploads. Unclaimed uploads (staged but never attached to a document) are retired by
`sweepStagedUploads` after 24 hours; nothing schedules it yet.

## Database workflow

1. Modify `shared/schema.ts`.
2. `npm run db:generate`, then rename the generated file to a meaningful tag (update
   `migrations/meta/_journal.json` to match) and review the SQL. Keep the
   `--> statement-breakpoint` markers.
3. `npm run db:migrate` against the development database.
4. Commit schema, migration and snapshot together.
5. For a production release an authorized operator reviews the committed migration and runs the
   same `drizzle-kit migrate` against the production connection before serving the new build.

Never run DDL at application startup, never `drizzle-kit push`, and never rewrite a migration
that has been applied anywhere.

## Testing

- `tests/unit`: pure logic (environment rules, lifecycle, password hashing, safety guards,
  contract parity).
- `tests/api`: HTTP boundary through the real middleware stack without a database.
- `tests/integration`: Supertest against a real, disposable PostgreSQL database.
- `tests/e2e`: Playwright against the real app (API + Vite) on a disposable database.

All test code is type-checked, linted and formatted with the same gates as the server.

**Test database safety.** `tests/support/isolated-postgres.ts` derives a uniquely named
`vault_test_<uuid>` database from `DATABASE_URL`, applies the checked-in migrations with
`drizzle-kit migrate`, and drops it afterwards. Independently, `createDatabase` refuses to bind
the application pool to any database not named `vault_test_*` when `NODE_ENV=test`, so tests
cannot touch development or production data regardless of execution order.

**Authentication in tests.** `createTestContext()` seeds a studio_admin (`admin@vault.test`)
and an ordinary user (`member@vault.test`) through the real bootstrap and provisioning
use-cases, and `loginAs(credentials)` returns a Supertest agent that signed in through the real
`/auth/login` endpoint and carries the session cookie. There is no bypass.

**Playwright.** The web server (`tests/e2e/test-server.ts`) listens on `VAULT_E2E_PORT`
(default 5101, distinct from the dev port), creates its own disposable database and seeds the
same two accounts, and raises the per-IP read and write rate-limit budgets through the
`rateLimits` option of `createVaultServer` because every parallel spec shares one loopback
address (production never sets that option). Specs sign in through the login form
(`tests/e2e/support.ts`). Playwright
kills the server without running shutdown hooks, so the database name is written to
`test-results/e2e-database.json` and dropped by `tests/e2e/global-teardown.ts`. On Replit,
install Chromium through the Nix configuration; if auto-discovery fails set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Style

Foundation code (server, shared, client features, tests) is strict TypeScript, linted and
Prettier-checked. Format only touched foundation files; do not mass-format the validated
prototype UI under `client/src/components`, `client/src/pages` and `client/src/lib/store.ts`.
No `any`, no hidden state transitions, explicit error handling.

## Deploying to Replit

Replit remains the deployment target. Its build and run commands are `npm run build` and
`npm start` (see `.replit`). Replit provides `DATABASE_URL`, `REPLIT_DOMAINS` and `PORT` as
environment variables and terminates HTTPS; `.env.local` plays no part. File storage must be
configured explicitly: `VAULT_STORAGE_PROVIDER=replit` once the object storage adapter ships
(ADR 0008), never the deployment filesystem, which is ephemeral. Release steps: migrate
(explicit, above), build, start, then run `npm run bootstrap:admin` once with the three
bootstrap variables set as protected secrets, and delete the password secret. This repository
does not claim that a production deployment has been executed since the authentication change;
verify the CSP and health checks on the first fresh deployment.
