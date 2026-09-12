# Development

## Commands

```bash
npm install
npm run dev
npm run check
npm run lint
npm run format:check
npm test
npm run test:e2e
npm run build
```

`npm run dev` serves Express and Vite on `PORT` (5000 by default). The workflow must run this
unified command, not `dev:client`.

Browser smoke tests run only against the isolated test-app factory and a disposable
`vault_test_*` PostgreSQL database. In Replit, install Chromium and its shared libraries through
the System Dependencies/Nix configuration. If auto-discovery is unavailable, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to the system Chromium executable before `npm run test:e2e`.

## Environment

Replit supplies `DATABASE_URL` and managed Clerk secrets. Never expose `CLERK_SECRET_KEY`,
database URLs, cookies or tokens to Vite. Required server variables are validated at startup:
`DATABASE_URL`, `CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY`. `REPLIT_DOMAINS` is required in
production. `VAULT_BOOTSTRAP_ADMIN_CLERK_ID` is an optional, exact Clerk subject used only to
bootstrap the first local studio admin; configure it as a protected deployment secret and remove it
after bootstrap.

Clerk's canonical client proxy value is `VITE_CLERK_PROXY_URL`: it is intentionally empty in
development and automatically injected for production by Replit-managed Clerk. Do not hardcode or
manually provision a proxy URL; the client passes the value to `ClerkProvider` unconditionally.

Development and production use Replit-isolated PostgreSQL and managed Clerk environments. Test
setup derives a uniquely named disposable `vault_test_*` database from the development cluster
connection, runs the same `drizzle-kit migrate` runner used by development, and drops that database
afterward. It is fail-closed outside `NODE_ENV=test` and never writes development `public` tables.
It currently uses the development cluster credential only to create/drop that disposable database;
it does **not** claim separate test credentials. Where the PostgreSQL provider permits it, release
engineering should provision a dedicated role restricted to `vault_test_*` databases and supply it
to the test runner.

## Database workflow

1. Modify `shared/schema.ts`.
2. Generate/review the SQL migration (`npm run db:generate`) or create a reviewed equivalent.
3. Apply it to the development database only with `npm run db:migrate`.
4. Commit schema and migration together.
5. During a production release, an authorized operator reviews the committed migration files and
   runs the same migration command against the production deployment connection before serving the
   new release.

Never use startup migrations or unreviewed schema pushes. This repository does not claim that a
production migration, bootstrap, or live Clerk sign-in has been executed or verified.

## Testing

Vitest unit tests are under `tests/unit`. API integration tests should use Supertest plus an
isolated real PostgreSQL test database. Browser smoke tests belong in `tests/e2e` and use
Playwright. They must use a local test auth seam rather than live Clerk.

## Style

New foundation code is strict TypeScript, ESLint-scoped and Prettier-checked. Format only touched
foundation files; do not mass-format validated prototype UI. Use named domain modules, no `any`,
no hidden state transitions, and explicit error handling.