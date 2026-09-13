==================================================
ENGINEERING QUALITY STANDARD
==================================================

Treat this codebase as a long-lived commercial software product that future engineers and future coding agents will extend for years.

Your job is not merely to make the feature work.

Your job is to make the implementation exceptionally well engineered.

Hold the work to the highest practical standard for:

- architecture
- naming
- module boundaries
- type safety
- database design
- API design
- error handling
- security
- testability
- maintainability
- readability
- documentation
- future extensibility
- coding-agent comprehensibility

Prefer clear, explicit, boring architecture over clever abstractions.

Optimise for low cognitive overhead.

A strong future coding agent should be able to enter the repository, inspect a domain, and immediately understand:

- where business logic belongs
- where persistence belongs
- how transactions work
- how authorization works
- how contracts are defined
- how frontend server state is fetched
- how mutations are handled
- how concurrency conflicts work
- how audit events are written
- how tests are structured
- how a new domain should be added safely

Do not leave behind ambiguous patterns that future agents could copy incorrectly.

When there are multiple valid implementation options, prefer the one that:

1. is easiest to reason about correctly;
2. has the clearest ownership of responsibilities;
3. exposes the fewest hidden side effects;
4. is easiest to test;
5. uses strong database constraints rather than convention alone where appropriate;
6. keeps domain rules out of controllers and repositories;
7. avoids unnecessary coupling;
8. makes incorrect future changes harder to make accidentally.

Use precise names.

Avoid vague names such as:
- data
- helper
- manager
- utils
- service2
- common
unless the abstraction genuinely warrants them.

Keep files and functions focused.

Do not create giant modules when a clear domain boundary exists, but do not fragment simple logic into dozens of tiny files either.

Avoid:
- premature abstractions
- generic base repositories
- generic CRUD frameworks
- magic configuration
- hidden global state
- singleton dependencies where explicit composition is clearer
- broad `any`
- unsafe casts
- duplicated business rules
- business logic in React components
- business logic in HTTP routes
- business policy inside repositories
- database row types leaking directly into API contracts
- comments that compensate for confusing code

Prefer code that explains itself through structure, naming and types.

Use comments for:
- invariants
- non-obvious security reasoning
- concurrency decisions
- unusual provider limitations
- deliberately chosen trade-offs

Do not comment obvious syntax.

==================================================
DATABASE QUALITY
==================================================

Treat PostgreSQL as an active integrity boundary, not passive storage.

Where appropriate use:

- foreign keys
- unique constraints
- check constraints
- not-null constraints
- indexes matching real query patterns
- explicit deletion behaviour
- transactional writes
- optimistic concurrency

Do not rely only on application code for invariants PostgreSQL can enforce safely.

Every migration must be:

- generated where appropriate
- reviewed
- deterministic
- safe from a clean database
- consistent with existing migration history

Never rewrite historical migrations merely to make them prettier.

==================================================
TYPE SAFETY
==================================================

Maintain strict TypeScript discipline.

Prefer:
- narrow input types
- discriminated unions where useful
- exhaustive handling
- shared contract schemas
- explicit return types where they improve clarity
- strongly typed repository inputs
- strongly typed service results

Avoid:
- broad Partial<T> persistence APIs
- unchecked casts
- `any`
- stringly typed state where an enum/union is appropriate
- duplicating enum values across database/contracts without a parity guarantee

Do not weaken types simply to make compilation easier.

==================================================
API / DOMAIN QUALITY
==================================================

Design APIs around business operations rather than database tables.

Prefer explicit commands such as:

- create
- assign
- submit
- approve
- archive
- restore
- change status

when those represent real business actions.

Do not expose unrestricted generic PATCH operations for lifecycle behaviour.

Keep:
- HTTP concerns in routes/controllers
- business policy in services/use cases
- persistence in repositories
- database transaction ownership at the service/use-case layer
- audit semantics at the business-command level

==================================================
FRONTEND QUALITY
==================================================

The frontend should have one clear source of truth for durable server state.

Prefer:

React component
→ feature hook
→ typed API client
→ shared contract

Use React Query for persisted server state.

Do not leave duplicate durable state in Zustand once a domain is migrated.

Keep local component state for:
- modal state
- temporary inputs
- local view preferences
- unsaved form state

not authoritative business records.

Components should remain primarily presentational/orchestration-focused rather than containing backend business rules.

==================================================
TEST QUALITY
==================================================

Do not optimise for test count.

Optimise for protection against regressions and incorrect future agent changes.

Tests should focus on:

- important invariants
- authorization
- transaction atomicity
- concurrency
- database constraints
- failure paths
- cross-user behaviour
- persistence
- audit behaviour
- real user workflows

Prefer meaningful integration tests over shallow mock-heavy tests when the behaviour crosses layers.

Use the real PostgreSQL test infrastructure for persistence behaviour.

Keep Playwright small but representative.

When a bug is discovered during implementation, add a regression test when practical.

==================================================
SECURITY QUALITY
==================================================

Assume the Vault may eventually hold:

- contracts
- rights documentation
- production documents
- financial information
- personal information

Do not lower security standards because the current deployment is small.

Follow fail-closed behaviour.

Never:
- expose secrets
- trust browser-provided identity
- trust browser-provided ownership
- trust user-provided filenames or storage paths
- rely on hidden buttons as authorization
- log credentials
- leak sensitive internal errors

==================================================
AGENT READABILITY
==================================================

This is especially important.

Future development will often be performed by coding agents.

Every domain should have a predictable shape.

Avoid introducing a new architectural pattern when an established one already solves the problem well.

When adding a genuinely new reusable pattern:
- make it explicit
- document it briefly
- provide one canonical implementation
- make future usage obvious

Update architecture documentation whenever a durable engineering rule changes.

Do not let documentation drift from implementation.

If you encounter code that technically works but would create a poor precedent for future domains, improve the pattern now while the scope is still contained.

==================================================
QUALITY BAR
==================================================

Before declaring the milestone complete, ask:

"If another strong engineer or coding agent copied this implementation as the template for the next five Vault domains, would that make the overall codebase better?"

If the answer is not clearly yes, improve it before finishing.

Do not over-engineer.

The target is not maximum abstraction or theoretical perfection.

The target is:

simple
explicit
secure
well-factored
well-tested
well-documented
easy to extend
hard to misuse

Build the version you would be happy to inherit and maintain several years from now.