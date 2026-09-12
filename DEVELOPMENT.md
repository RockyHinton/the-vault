# Development

Local development is the primary engineering environment. GitHub is the source of truth.
Replit is the current deployment target (hosting, PostgreSQL, managed Clerk); it is a provider,
not part of the architecture, and nothing below should make the code depend on it.

## Commands

```bash
npm install
npm run dev            # Express + Vite on PORT (5000 default, 5001 locally via .env.local)
npm run check          # TypeScript (client, shared, server, tests)
npm run lint           # ESLint (server, shared, client features, tests)
npm run format:check   # Prettier (same scope); `npm run format` fixes
npm test               # Vitest: unit, API boundary, PostgreSQL integration
npm run test:e2e       # Playwright browser smoke test
npm run build          # Vite client + esbuild server into dist/
npm run db:generate    # drizzle-kit generate (after editing shared/schema.ts)
npm run db:migrate     # drizzle-kit migrate against DATABASE_URL
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
| `VITE_CLERK_PUBLISHABLE_KEY` | yes (local) | Written by the Clerk CLI. Vite exposes it to the browser; the server accepts it as its publishable key when `CLERK_PUBLISHABLE_KEY` is absent. |
| `CLERK_PUBLISHABLE_KEY` | production | Set by Replit-managed Clerk. Takes precedence over the Vite key. Must be `pk_live_` in production. |
| `CLERK_SECRET_KEY` | yes | Server only. Never prefix it with `VITE_`. Must be `sk_live_` in production. |
| `PORT` | no | Default 5000. Replit sets it in `.replit`; macOS reserves 5000, so `.env.local` uses 5001. |
| `VAULT_BOOTSTRAP_ADMIN_CLERK_ID` | bootstrap only | Exact Clerk user ID allowed to self-provision the first `studio_admin`. Remove after use. |
| `REPLIT_DOMAINS` | production | Comma-separated allowed hostnames (Replit sets it). |
| `REPLIT_DEV_DOMAIN` | no | Extra allowed host in development (Replit sets it). |
| `LOG_LEVEL` | no | `debug`, `info` (default), `warn`, `error`. |

`.env.example` lists these with placeholders. `.env.local` is git-ignored; never commit secrets.

## First-time local setup

1. **PostgreSQL 16.** Any local instance works. With Docker:

   ```bash
   docker run --name vault-postgres -e POSTGRES_USER=vault -e POSTGRES_PASSWORD=change-me \
     -e POSTGRES_DB=vault_dev -p 5432:5432 -d postgres:16
   ```

   The database user must be able to `CREATE DATABASE`: tests create disposable databases.

2. **Clerk development instance.** Create (or reuse) a Clerk application and pull its
   development keys into the env file:

   ```bash
   npx clerk@latest env pull
   ```

   This writes `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to `.env.local`. Nothing else
   about Clerk needs configuring locally; the production proxy topology used by Replit-managed
   Clerk is disabled outside production.

3. **Complete `.env.local`** from `.env.example`: add `DATABASE_URL` and `PORT=5001`.

4. **Migrate and start:**

   ```bash
   npm run db:migrate
   npm run dev
   ```

   Open `http://localhost:5001`.

## First-admin bootstrap

Signing in with Clerk never grants access by itself. Access is decided by the local
`application_users` table, and a fresh database has no rows. The first `studio_admin` is
provisioned through an exact-match bootstrap:

1. Start the app and sign in (or sign up) through Clerk at `/sign-in`.
2. You land on **Access not yet granted**. The screen shows your Clerk user ID (`user_...`);
   the same value is returned by `GET /api/v1/auth/me` as `error.details.clerkUserId`.
3. Put it in `.env.local`:

   ```
   VAULT_BOOTSTRAP_ADMIN_CLERK_ID=user_...
   ```

4. Restart `npm run dev` and reload the page. On the next authenticated request the server
   creates your `application_users` row as an active `studio_admin`, fills email and display
   name from the Clerk backend API, and writes a `user.bootstrap_admin_created` audit event in the
   same transaction. You are redirected to Projects.
5. Remove `VAULT_BOOTSTRAP_ADMIN_CLERK_ID` from `.env.local`.

Properties: only the exact configured Clerk ID can bootstrap; the operation is idempotent (the
unique index on `clerk_user_id` guarantees one row, and only an actual insert is audited); it
never creates a second admin or upgrades an existing account. There is no username/password
path and no development bypass. On Replit, the same variable is set as a protected deployment
secret for the first production operator and removed afterwards.

Granting access to further users is a future users domain; until then an operator inserts
`application_users` rows directly.

## Database workflow

1. Modify `shared/schema.ts`.
2. `npm run db:generate`, then rename the generated file to a meaningful tag and review the SQL.
   Keep the `--> statement-breakpoint` markers.
3. `npm run db:migrate` against the development database.
4. Commit schema, migration and snapshot together.
5. For a production release an authorized operator reviews the committed migration and runs the
   same `drizzle-kit migrate` against the production connection before serving the new build.

Never run DDL at application startup, never `drizzle-kit push`, and never rewrite a migration
that has been applied anywhere.

## Testing

- `tests/unit`: pure logic (environment rules, lifecycle, safety guards, contract parity).
- `tests/api`: HTTP boundary through the real middleware stack without a database.
- `tests/integration`: Supertest against a real, disposable PostgreSQL database.
- `tests/e2e`: Playwright against the real app (API + Vite) on a disposable database.

All test code is type-checked, linted and formatted with the same gates as the server.

**Test database safety.** `tests/support/isolated-postgres.ts` derives a uniquely named
`vault_test_<uuid>` database from `DATABASE_URL`, applies the checked-in migrations with
`drizzle-kit migrate`, and drops it afterwards. Independently, `createDatabase` refuses to bind
the application pool to any database not named `vault_test_*` when `NODE_ENV=test`, so tests
cannot touch development or production data regardless of execution order.

**Test identity seam.** API and browser tests do not talk to Clerk. `createVaultServer` accepts
a `verifiedIdentity` that stands in for the verified Clerk session; it still passes through
local-user lookup and role policy. The composition root throws if it is supplied outside
`NODE_ENV=test`, and the production build hard-codes `NODE_ENV` to `production`.

**Playwright.** The web server (`tests/e2e/test-server.ts`) listens on `VAULT_E2E_PORT`
(default 5101, distinct from the dev port) and creates its own disposable database. Playwright
kills that process without running shutdown hooks, so the database name is written to
`test-results/e2e-database.json` and dropped by `tests/e2e/global-teardown.ts`. Repeated runs
leave no `vault_test_*` databases behind. On Replit, install Chromium through the Nix
configuration; if auto-discovery fails set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Style

Foundation code (server, shared, client features, tests) is strict TypeScript, linted and
Prettier-checked. Format only touched foundation files; do not mass-format the validated
prototype UI under `client/src/components` and `client/src/pages`. No `any`, no hidden state
transitions, explicit error handling.

## Deploying to Replit

Replit remains the deployment target. Its build and run commands are `npm run build` and
`npm start` (see `.replit`). Replit provides `DATABASE_URL`, `REPLIT_DOMAINS`, `PORT` and the
managed-Clerk `CLERK_*` keys as environment variables; `.env.local` plays no part. Migrations
are an explicit release step (above). This repository does not claim that a production
deployment, migration or bootstrap has been executed since the foundation refactor; verify the
Clerk proxy, CSP and health checks on the first fresh deployment.
