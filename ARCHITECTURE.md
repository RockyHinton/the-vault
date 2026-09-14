# Architecture

The architecture documentation lives in `docs/architecture/`, one focused guide per concern,
so that each fits in a coding agent's context. Start with:

- [Overview](docs/architecture/overview.md): system shape, dependency direction, module map,
  the modular-monolith and one-company-per-deployment decisions, source-of-truth rules.
- [Domain pattern](docs/architecture/domain-pattern.md): the canonical layering every domain
  follows, responsibilities at each boundary, the HTTP contract, reference implementations.

Then by concern: [auth and authorization](docs/architecture/auth-and-authorization.md),
[files and documents](docs/architecture/files-and-documents.md),
[frontend state](docs/architecture/frontend-state.md),
[transactions, concurrency and audit](docs/architecture/transactions-concurrency-audit.md),
[finance](docs/architecture/finance.md),
[scripts and provenance](docs/architecture/scripts-and-provenance.md),
[deployment model](docs/architecture/deployment-model.md),
[domain reference](docs/architecture/domain-reference.md).

Historical decisions are in [docs/decisions](docs/decisions/README.md). Development guides
are in [docs/development](DEVELOPMENT.md).
