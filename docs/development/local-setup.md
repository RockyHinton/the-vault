# Local setup

Prerequisites: Node 20.12 or later (see `engines` in `package.json`), npm, PostgreSQL 16
(Docker is the easiest path), and Chromium for the browser tests. Nothing else is assumed.

```bash
git clone <repository> the-vault && cd the-vault
npm ci
docker run --name vault-postgres -e POSTGRES_USER=vault -e POSTGRES_PASSWORD=change-me \
  -e POSTGRES_DB=vault_dev -p 5432:5432 -d postgres:16
cp .env.example .env.local          # DATABASE_URL and PORT=5001 are already filled in
npm run db:migrate                  # applies migrations/ to vault_dev
VAULT_BOOTSTRAP_ADMIN_EMAIL=you@example.com \
VAULT_BOOTSTRAP_ADMIN_PASSWORD='at-least-twelve-characters' \
VAULT_BOOTSTRAP_ADMIN_NAME='Your Name' npm run bootstrap:admin
npm run dev                         # http://localhost:5001, sign in with the bootstrap credentials
```

The database user must be able to `CREATE DATABASE` because tests create disposable databases.

## Commands

```bash
npm run dev              # Express + Vite on PORT (5001 via .env.local; Replit sets 5000)
npm run check            # TypeScript (client, shared, server, tests)
npm run lint             # ESLint (server, shared, client features, tests)
npm run format:check     # Prettier, same scope; `npm run format` fixes
npm test                 # Vitest: unit, api, storage, integration (needs PostgreSQL)
npx playwright install chromium   # once, before the first browser run
npm run test:e2e         # Playwright (needs PostgreSQL)
npm run build            # Vite client + esbuild server into dist/
npm start                # serves dist/ in production mode
npm run db:generate      # drizzle-kit generate after editing shared/schema.ts
npm run db:migrate       # drizzle-kit migrate against DATABASE_URL
npm run bootstrap:admin  # one-time first studio_admin
```

`npm run dev` is the single command that serves the app; do not run the client alone.

## Environment

The server validates its environment at startup (`server/config/env.ts`). Outside production
it first loads `.env.local` (git-ignored, never committed); variables already in the process
win, so hosts and CI override the file. Production never reads the file.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `PORT` | no | default 5000; macOS reserves 5000, so `.env.local` uses 5001 |
| `LOG_LEVEL` | no | `debug`, `info` (default), `warn`, `error`; events below it are dropped |
| `VAULT_STORAGE_PROVIDER` | production | `local` (default outside production) or the object-storage adapter |
| `VAULT_STORAGE_LOCAL_DIR` | no | directory for `local` storage; default `.vault-data/files` (git-ignored) |
| `VAULT_MAX_UPLOAD_BYTES` | no | default 50 MiB |
| `VAULT_BOOTSTRAP_ADMIN_EMAIL`, `_PASSWORD`, `_NAME` | bootstrap only | read only by `npm run bootstrap:admin`; remove the password afterwards |
| `REPLIT_DOMAINS` | production | comma-separated allowed hostnames (any host can set them) |
| `REPLIT_DEV_DOMAIN` | no | extra allowed host in development |

## Accounts

A fresh database has no users. The bootstrap command creates the first active studio_admin,
its credential and the audit event in one transaction; running it again is a no-op and never
changes the password. Signed in as a studio_admin, **Settings & Admin → Users → Add user**
provisions further accounts (name, email, initial password of 12+ characters, role) and
changes roles, suspends and reinstates. Suspension revokes every session the user holds. You
cannot demote or suspend yourself, and the last active studio_admin cannot be demoted or
suspended. There is no password reset yet: an administrator provisions a new account when a
password is lost.

## Sessions and files locally

The session cookie is `HttpOnly; SameSite=Lax; Path=/`, seven-day lifetime, 24-hour idle
timeout, `Secure` only in production (local HTTP works). Uploaded bytes live under
`.vault-data/files` through the `local` adapter; the database holds metadata and a random key.
To reset local files stop the app and delete that directory together with the `file_objects`
and `documents` rows, or leave them: a missing object is reported as unavailable, never as
missing metadata.

## Style

Foundation code (`server`, `shared`, `client/src/features`, `tests`) is strict TypeScript,
linted and Prettier-checked; format only touched foundation files and do not mass-format the
validated product UI under `client/src/components` and `client/src/pages`. No `any`, no
hidden state transitions, explicit error handling.
