# The Vault on Replit

This repository runs the existing React/Vite + Express application as one process.
Use the **Start application** workflow (`npm run dev`) for the development preview on
port 5000. Do not run the Vite client alone.
Use Replit's schema-validated replacement when editing `.replit`; direct patches are
refused and leading comments may be stripped, so keep warnings beside their settings.

## Development services

- `DATABASE_URL` is supplied by Replit's development PostgreSQL database. Its schema
  comes only from the committed migration chain: `npm run db:migrate`. Do not use
  `drizzle-kit push` or run migrations on application startup.
- A dedicated development App Storage bucket is selected by the development-only
  `VAULT_STORAGE_BUCKET` setting. `VAULT_STORAGE_PROVIDER=replit` and
  `VAULT_STORAGE_PREFIX=dev` are also development-only settings. Never use a
  production bucket in the workspace. The bucket ID in `.replit` belongs to this
  Replit project; replace it when creating a new instance, never copy it to production.
- The development preview host comes from Replit's `REPLIT_DEV_DOMAIN` /
  `REPLIT_DOMAINS` values, not a hostname pinned in source. Production must have
  its own allowed-host configuration.
- First-account setup is a one-time operator command: `npm run bootstrap:admin`
  with the three `VAULT_BOOTSTRAP_ADMIN_*` secrets. Remove those bootstrap secrets
  after success. Do not put them in source files or a running web server's environment.

## Verification

`npm run check`, `npm run build`, `GET /api/v1/health` and
`GET /api/v1/ready` check code, build, process and database respectively.
To validate the live **development** bucket, run
`VAULT_REPLIT_LIVE_STORAGE_BUCKET="$VAULT_STORAGE_BUCKET" npx vitest run tests/storage/replit-file-storage.live.test.ts`.

## Production is separate

Do not publish as part of development setup. Replit provisions a separate production
PostgreSQL database when publishing. Before a first production publish, confirm how
Replit's managed schema sync interacts with the repository's migration history and
agree an operator migration procedure; never add startup DDL. Create a distinct
production App Storage bucket and set production-specific storage and hostname
settings, without copying development data or files. See `REPLIT_DEPLOYMENT.md`
for the complete isolation contract and production acceptance checks.