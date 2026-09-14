# The Vault

A film-production operating system: one workspace per project across evaluation,
development, production and distribution, with people, rights, legal records, scripts,
budgets, financing, cash flow and distribution territories persisted in PostgreSQL and every
file kept private behind the application.

It is built as a **canonical product deployed one instance per production company**: the
same repository, a separate deployment with its own database, file store, users and secrets
for each client. It is not multi-tenant by design.

## Architecture in one paragraph

A TypeScript modular monolith. React/Vite pages read server state through typed feature
modules and React Query; shared Zod contracts define the HTTP boundary; an Express server
validates requests, applies policy and transactions in services, persists through
repositories with Drizzle on PostgreSQL, and appends a typed audit event inside every
command's transaction. Files are immutable private bytes behind a storage adapter; documents
are versioned lineages that other domains attach to. Money is exact everywhere. Details:
[docs/architecture/overview.md](docs/architecture/overview.md).

## Quick start

Requires Node 20.12+, PostgreSQL 16 (Docker is fine) and Chromium for browser tests.

```bash
npm ci
docker run --name vault-postgres -e POSTGRES_USER=vault -e POSTGRES_PASSWORD=change-me \
  -e POSTGRES_DB=vault_dev -p 5432:5432 -d postgres:16
cp .env.example .env.local
npm run db:migrate
VAULT_BOOTSTRAP_ADMIN_EMAIL=you@example.com VAULT_BOOTSTRAP_ADMIN_PASSWORD='twelve-or-more' \
VAULT_BOOTSTRAP_ADMIN_NAME='Your Name' npm run bootstrap:admin
npm run dev                     # http://localhost:5001
```

Full setup, environment and account management: [docs/development/local-setup.md](docs/development/local-setup.md).

## Quality gates

```bash
npm run check && npm run lint && npm run format:check
npm test                        # Vitest: unit, API boundary, storage contract, PostgreSQL integration
npx playwright install chromium # once
npm run test:e2e                # Playwright against the real app
npm run build
```

## Documentation map

| Read | For |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | the coding-agent entry point and the rules that do not bend |
| [docs/architecture/overview.md](docs/architecture/overview.md) | system shape, module map, source-of-truth rules |
| [docs/architecture/domain-pattern.md](docs/architecture/domain-pattern.md) | the canonical layering every domain follows |
| [docs/architecture/](docs/architecture/) | auth and authorization, files and documents, frontend state, transactions/concurrency/audit, finance, scripts and provenance, deployment model, domain reference |
| [docs/development/](docs/development/) | local setup, testing, adding a domain, database migrations |
| [docs/decisions/](docs/decisions/README.md) | architecture decision records, with an index of what is current |
| [docs/ENGINEERING_STANDARDS.md](docs/ENGINEERING_STANDARDS.md) | the engineering quality bar |
