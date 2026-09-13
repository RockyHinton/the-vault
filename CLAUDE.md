# The Vault — Claude Code Instructions

You are the primary coding architect for The Vault.

The Vault is a long-lived commercial film-production operating system. Treat every implementation as production-quality infrastructure that future human engineers and coding agents will extend for years.

## Mandatory project context

Read and follow:

@ARCHITECTURE.md
@DEVELOPMENT.md
@docs/ENGINEERING_STANDARDS.md

## Core engineering rules

- Preserve the modular-monolith architecture.
- Prefer explicit, boring, strongly typed code over clever abstractions.
- Inspect existing implementation before changing architecture.
- Reuse established domain patterns unless there is a concrete reason not to.
- Keep business policy in services/use cases.
- Keep persistence in repositories.
- Service/use-case layer owns transactions.
- API contracts must remain separate from database row types.
- PostgreSQL should enforce invariants where appropriate.
- Durable server state belongs in PostgreSQL/object storage, not Zustand.
- Use React Query for backend-derived state.
- Server-side authorization is authoritative.
- Maintain optimistic concurrency for editable aggregates.
- Audit meaningful state-changing business commands.
- Do not introduce base repositories, generic CRUD frameworks, event buses, microservices, tenancy, or speculative permission systems.
- Keep provider-specific infrastructure behind narrow adapters.
- The application must remain portable to Replit for deployment.

## Quality bar

Before finishing a change, ask:

"If another strong engineer or coding agent copied this implementation as the pattern for the next five Vault domains, would the codebase become better?"

If not, improve the implementation before finishing.

## Verification

For meaningful implementation work, run the relevant quality gates, normally:

- npm run check
- npm run lint
- npm run format:check
- npm test
- npm run test:e2e where appropriate
- npm run build
- git diff --check

Do not commit or push unless explicitly instructed.
