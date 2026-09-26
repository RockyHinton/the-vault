# Replit deployment handoff

This is the infrastructure contract for running The Vault on Replit. It is written for
whoever — person or Replit Agent — provisions the platform resources. **Provision and
configure; do not redesign.**

## What this repository is

The **Canonical Vault Full-Stack V1** foundation: a film-production operating system built
as one TypeScript modular monolith (React/Vite client, Express server, PostgreSQL, private
file bytes behind a storage adapter). It is a finished, locked architecture, not a prototype.

**Locked architecture does not mean a Replit production deployment has been validated.**
The architecture is accepted and the Replit development integration has been verified;
the production boundary still awaits controlled private candidate verification.

It is intended to be deployed **one isolated instance per production company**. Each
client company gets its own deployment, its own database, its own file store, its own
users and its own secrets.
**It is deliberately not multi-tenant, and no tenant layer may be added.** "Deploy for
another company" means another instance of this repository, never another row.

The first production instance is **3six9 Studios**. The 3six9 presentation branding in the
client is intentional.

Architecture reference: [`CLAUDE.md`](CLAUDE.md) and [`docs/architecture/`](docs/architecture/),
starting with [`overview.md`](docs/architecture/overview.md) and
[`deployment-model.md`](docs/architecture/deployment-model.md).

## Do not

- **Do not redesign or reset the database.** The schema is locked.
- **Do not run `drizzle-kit push`.** Ever. Migrations are the only path to the schema.
- **Do not edit, delete, renumber or re-generate migrations `0000`–`0015`.** They are
  immutable. Future changes add `0016`, `0017`, …
- **Do not add DDL, seeds, resets or automatic migrations to application startup.**
  Migrations are run by an operator, explicitly, before the new build serves traffic.
- **Do not replace authentication.** The Vault has first-party password authentication with
  opaque hashed sessions (ADR 0007). **Replit Auth is not wanted.** There is deliberately no
  password reset and no MFA.
- **Do not add tenant, organisation or workspace-switching concepts**, and no per-project
  ACLs. There are two roles (`studio_admin`, `user`) and studio-wide visibility.
- **Do not build a second upload path** and do not bypass `FileStorage`. There is exactly one
  file architecture: bytes behind the `FileStorage` interface, documents as versioned
  lineages. No public URL, no signed URL, no direct-to-bucket upload from the browser.
- **Do not modify the Files or Documents domains**, or any other domain in `server/modules`,
  `shared/` or `client/src/features`, to accommodate the platform. Provider-specific code
  belongs in `server/config/`, `server/files/` and the build scripts — nowhere else.
- **Do not copy development data into production**, in either direction.

If something appears to require one of the above, stop and say so. It means the requirement
has been misread, or the boundary needs a deliberate change made in the codebase first.

## Do

1. Create and attach a Replit **PostgreSQL** database for development.
2. Create and attach a **development App Storage bucket**.
3. Configure the workspace environment (secrets) per the table below.
4. `npm run db:migrate` — applies `0000`–`0015` to the empty development database.
5. `npm run bootstrap:admin` — creates the first `studio_admin`, once.
6. Verify build and start, then run the smoke test below.
7. Run the live storage acceptance gate (below).
8. Configure **production** separately and later, with its own database and its own bucket.

## Commands

```bash
npm ci                    # install exactly what package-lock.json pins
npm run db:migrate        # apply migrations to DATABASE_URL (never automatic)
npm run bootstrap:admin   # one-time first studio_admin
npm run build             # Vite client -> dist/public, esbuild server -> dist/index.cjs
npm start                 # production: NODE_ENV=production node dist/index.cjs
```

Normal workspace development is a single command:

```bash
npm run dev               # Express + Vite on PORT, one port, API and client together
```

Notes that matter:

- **`npm run build` needs devDependencies.** Do not set `NODE_ENV=production` in the
  workspace environment — `npm ci` would omit them and the build would fail. `npm start`
  sets `NODE_ENV=production` itself.
- **Node 20.12 or later** (`engines` in `package.json`).
- The server binds `0.0.0.0` on `PORT`. One public web port is sufficient. No WebSockets are
  needed in production.
- Health: `GET /api/v1/health` (liveness). Readiness: `GET /api/v1/ready` (executes
  `select 1` on the real pool). Neither requires authentication.

## Environment

| Variable | Required | Who supplies it |
| --- | --- | --- |
| `DATABASE_URL` | yes | Replit (the attached database) |
| `VAULT_ALLOWED_HOSTS` | production; recommended everywhere | you — the bare hostnames this deployment serves, comma-separated, no scheme |
| `VAULT_STORAGE_PROVIDER` | production, explicitly | `replit` on Replit; `local` only for a host with a persistent volume |
| `VAULT_STORAGE_BUCKET` | whenever the provider is not `local` | you — **a different bucket per environment** |
| `VAULT_STORAGE_PREFIX` | no | optional key prefix, e.g. `dev` or `production` |
| `PORT` | no | Replit (`.replit` sets 5000) |
| `LOG_LEVEL` | no | `debug` / `info` / `warn` / `error` |
| `VAULT_MAX_UPLOAD_BYTES` | no | default 50 MiB |
| `VAULT_BOOTSTRAP_ADMIN_EMAIL` / `_PASSWORD` / `_NAME` | bootstrap only | you — **delete the password secret after the first run** |

`REPLIT_DOMAINS` and `REPLIT_DEV_DOMAIN` are read as *fallbacks* for the host allowlist when
`VAULT_ALLOWED_HOSTS` is unset. Set `VAULT_ALLOWED_HOSTS` explicitly anyway: it is the
portable setting, and it removes a whole class of "every request returns 400 UNTRUSTED_HOST"
confusion. Full contract: [`.env.example`](.env.example).

The server validates its environment at startup and **refuses to boot** on a bad
combination — a production deployment with no host list, or a non-`local` storage provider
with no bucket. A failed start with a message naming the variable is the intended behaviour,
not a bug to work around.

## Development / production isolation contract

```
DEVELOPMENT                             PRODUCTION
Replit development PostgreSQL           Replit production PostgreSQL
dedicated DEVELOPMENT App Storage       dedicated PRODUCTION App Storage
workspace preview host                  published host / custom domain
its own secrets                         its own secrets
```

**Never point development and production at the same bucket.** Development code runs the
staged-upload sweep and can delete objects; pointed at the production bucket it would delete
real production file bytes. `VAULT_STORAGE_BUCKET` is what selects the correct target, and
the server refuses to start without it.

A Replit App may be able to reach more than one bucket, so **a different bucket id is a
configuration boundary, not an enforced one.** Part of the Replit-side work is to verify what
the platform currently supports and apply the strongest environment-specific access control
available — ideally so the development deployment has no ability to reach the production
bucket at all. Do not assume separation exists until it has been verified in the platform.

`VAULT_STORAGE_PREFIX` (`dev` / `production`) adds a second, cheaper line of defence. Use it
in addition to separate buckets, not instead of them.

Replit documentation differs on whether development Secrets sync to a published app.
Before any production candidate, inspect **Publishing → production app secrets** and
confirm that no development bootstrap values or bucket settings are present. Do not
assume a development Secret is isolated from publication.

## Database policy

- A fresh Replit development database is initialised with **`npm run db:migrate`** and
  nothing else. No local database is copied, exported or imported.
- Migrations `0000`–`0015` are **immutable**. Once production exists they are permanent
  history.
- Future schema changes create `0016`, `0017`, … Additive by default; destructive changes go
  expand → migrate → contract across separate releases, because a migration must be safe
  against the build that is still running when it lands.
- **Never `drizzle-kit push`.** **Never reset production for a release.** **Never migrate
  automatically at startup.**
- Take a verified backup before any release that carries a migration. Schema does not roll
  back; code does.

The exact mechanics of applying a migration to the **production** database within Replit's
current publishing flow must be confirmed in the real platform before the first production
publish. Nothing about that flow is hard-coded here.

## Storage acceptance gate (Replit-side, required)

The Replit App Storage adapter is `server/files/replit-file-storage.ts`. It implements the
same four-method `FileStorage` interface as the local adapter and nothing above it changed.

Its contract suite **cannot run outside Replit**: `@replit/object-storage` obtains
credentials from a workspace-local sidecar. Run it in the workspace, against the
**development** bucket:

```bash
VAULT_REPLIT_LIVE_STORAGE_BUCKET=<development-bucket-id> \
  npx vitest run tests/storage/replit-file-storage.live.test.ts
```

It must pass before any file feature is trusted. It writes only under a unique
`vault_test_storage_*` prefix and sweeps up afterwards. The variable is deliberately
separate from `VAULT_STORAGE_BUCKET`. **Never point it at the production bucket.**

Two provider behaviours to confirm while you are there, both documented in the adapter:

- **Exclusive create is best-effort.** Replit's upload methods overwrite, and the SDK offers
  no conditional-create option, so the adapter checks `exists` first. Vault storage keys are
  32 cryptographically random bytes, so a collision is not a practical risk — but the
  guarantee is weaker than the local adapter's atomic link.
- **Aborted uploads.** The adapter fails fast and deletes the partial object. Confirm with a
  large upload cancelled mid-flight that no unreadable object is left behind.

## Development smoke test

After migrate + bootstrap + start:

1. `GET /api/v1/health` → 200; `GET /api/v1/ready` → 200 (proves the database).
2. Sign in through the real form with the bootstrap admin. No `UNTRUSTED_HOST`, no
   `INVALID_ORIGIN`.
3. Create, read and rename a project; confirm a stale-`version` update returns 409.
4. Upload a document (PDF).
5. **Download it and compare SHA-256 with the source file.** Byte integrity is the single
   most important storage check.
6. Add a second version; confirm version 1 still downloads, byte-identical.
7. Create a script from a PDF, open the reader, add a version.
8. Attach a document to a person and to a legal record; detach one.
9. Exercise Budget, Finance Plan, Cash Flow, Financing Overview and Distribution.
10. **Restart the deployment: all database data is still there.**
11. **Rebuild and redeploy: the file from step 5 still downloads with the same SHA-256.**

Steps 5, 10 and 11 decide whether the configuration is viable. If step 11 fails with
`VAULT_STORAGE_PROVIDER=local`, that is the expected result and the reason App Storage is
required.

## Still to validate on the real platform

These need a live deployment and are deliberately not guessed at locally:

- `X-Forwarded-For` hop count against `app.set("trust proxy", 1)` — if `req.ip` is a proxy
  address, every user shares one rate-limit bucket.
- Whether the platform health probe's `Host` header passes the host allowlist.
- A 50 MiB streamed upload and a long streamed download through the proxy.
- The production Content-Security-Policy against the PDF script reader. CSP is enabled only
  in production, so a development workspace cannot reveal this.
- Instance sizing: password hashing is scrypt at 64 MiB per hash, so concurrent sign-ins are
  memory-hungry by design. Do not weaken the parameters; size the instance.
- **Development database capability verified in this workspace (2026-09-25):**
  `CREATE DATABASE` and `DROP DATABASE` succeeded on an isolated `vault_test_*` database;
  the bootstrap and auth PostgreSQL integration tests passed using disposable databases.
  Replit Agent can run the repository's PostgreSQL integration and E2E database harness
  here, subject to each suite's other requirements. Point it at the development database
  only, never production; verify permissions again for any other workspace.

## Deployment type

Choose **Reserved VM** in the Publishing tool ("Adjust settings" → "Deployment type"). Rate
limits are in-memory per process, the PostgreSQL pool is per process, uploads and downloads
stream through a long-lived process, and one company's instance does not need horizontal
scaling. Autoscale would multiply the rate-limit budgets and the connection count by the
instance count.
