# Deployment model

## One canonical repository, one instance per production company

```
canonical repository (this)
        │  build + configure
        ▼
dedicated deployment for company A      dedicated deployment for company B
  its own PostgreSQL database             its own PostgreSQL database
  its own private file store              its own private file store
  its own users, projects, secrets        its own users, projects, secrets
```

Deploying The Vault for another production company means **creating another isolated
deployment from the same repository**, never adding a row, a tenant id or an organisation
switch to an existing one. Every table, session, file and audit event in an instance belongs
to that instance's single studio. This is the product's isolation model and its security
model; it is deliberately simple and must stay that way.

## Provider portability

The application core depends on Node, PostgreSQL and an object store. Everything
provider-specific sits behind a narrow boundary:

| Boundary | Where | Provider-specific today |
| --- | --- | --- |
| Environment | `server/config/env.ts` | `VAULT_ALLOWED_HOSTS` is the hostname allowlist; `REPLIT_DOMAINS` / `REPLIT_DEV_DOMAIN` are read only as Replit-provided fallbacks |
| File bytes | `server/files/file-storage.ts` interface, `storage-factory.ts` factory | `local` adapter; `replit` is `replit-file-storage.ts` over `@replit/object-storage`, selected by `VAULT_STORAGE_PROVIDER` and addressed by `VAULT_STORAGE_BUCKET` |
| Build and start | `script/build.ts`, `package.json` scripts, `.replit` | `.replit` runs the same `npm run build` / `npm start` any host would |
| Proxy | `app.set("trust proxy", 1)` in `server/app.ts` | correct behind one reverse-proxy hop |

Nothing in `server/modules`, `shared` or `client/src` references a provider. Replit is the
convenient first target, not an architectural dependency: the same repository should run on
any Node + PostgreSQL + object-storage host by supplying the environment below and, when
needed, a `FileStorage` adapter that passes `tests/support/storage-contract.ts`.

## What an instance needs

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | the instance's PostgreSQL database (migrated explicitly, never at startup) |
| `VAULT_ALLOWED_HOSTS` | comma-separated bare hostnames the instance serves; the host and origin guards refuse others (on Replit, `REPLIT_DOMAINS` is used when this is unset) |
| `VAULT_STORAGE_PROVIDER` | `local` on a persistent volume, or `replit` for Replit App Storage |
| `VAULT_STORAGE_LOCAL_DIR` | directory for the `local` provider |
| `VAULT_STORAGE_BUCKET` | required for any provider other than `local`: the bucket this instance owns. A different bucket per environment is what stops a development deployment writing into production's store |
| `VAULT_STORAGE_PREFIX` | optional key prefix inside the bucket (`dev`, `production`); a second line of defence, not a substitute for separate buckets |
| `PORT` | listening port (the host usually sets it) |
| `LOG_LEVEL` | `debug`, `info`, `warn` or `error`; events below it are dropped |
| `VAULT_MAX_UPLOAD_BYTES` | optional upload limit |
| `VAULT_BOOTSTRAP_ADMIN_*` | read only by `npm run bootstrap:admin`, once, then removed |

Release steps for any host: run `drizzle-kit migrate` against the instance database, build,
start, run the admin bootstrap once with the three bootstrap variables as protected secrets,
delete the password secret. Production requires HTTPS termination (the session cookie is
`Secure`), and mutations must arrive with an `Origin` naming the deployment.

## Build notes

`npm run build` emits the client to `dist/public` and the server to a single `dist/index.cjs`
that bundles the packages listed in `script/build.ts` and loads the rest from
`node_modules`. esbuild warns that `import.meta` is empty in CJS output: those references
are in the Vite dev-server path (`server/vite.ts`, `vite.config.ts`), which a production start
never evaluates (`frontend: "static"`). The warning is expected and harmless; it is not a
production blocker.

## Known gaps before the first production deployment

These are tracked, not hidden:

- The Replit App Storage adapter is implemented but **not yet verified against a live
  bucket**. `@replit/object-storage` reaches a workspace-local sidecar for credentials, so
  its contract suite can only run inside a Replit workspace:
  `VAULT_REPLIT_LIVE_STORAGE_BUCKET=<development-bucket> npx vitest run tests/storage/replit-file-storage.live.test.ts`.
  That is the acceptance gate, and it is Replit-side work (see
  [../../REPLIT_DEPLOYMENT.md](../../REPLIT_DEPLOYMENT.md)).
- The `replit` adapter's exclusive create is best-effort: the provider's uploads overwrite
  and its SDK exposes no conditional-create option, so the adapter checks `exists` first.
  Storage keys are 32 random bytes used once, so collision is not a practical risk, but the
  guarantee is weaker than the `local` adapter's atomic hard link.
- Separate buckets per environment are a configuration boundary. Whether the platform can
  make it an enforced one (a deployment with no access to the other environment's bucket)
  is to be verified in Replit.
- `sweepStagedUploads` (orphaned uploads older than 24 hours) exists but nothing schedules it.
- Rate limits are in-memory per process; an autoscaled host multiplies them by instance count.
- The production Content-Security-Policy is helmet's default and is only enabled in
  production; verify it against the PDF reader on the first deployment.
- Password reset and MFA are deliberately absent (ADR 0007); an administrator provisions a
  replacement account when a password is lost.
