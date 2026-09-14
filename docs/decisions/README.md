# Architecture decision records

Historical records of durable decisions. A superseded ADR stays as written, with a banner
pointing at what replaced it; the current rules are in `docs/architecture/`.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-modular-monolith.md) | Use a modular monolith | Accepted |
| [0002](0002-clerk-local-access.md) | Clerk with local access records | Superseded by 0007 |
| [0003](0003-project-lifecycle.md) | Explicit project lifecycle operations | Accepted |
| [0004](0004-service-owned-transactions.md) | Services own transactions; repositories take an executor | Accepted |
| [0005](0005-closed-access-provisioning.md) | Closed access, administrator provisioning | Accepted; identity provider part superseded by 0007 |
| [0006](0006-data-conventions.md) | Data conventions for authored records, money, dates and attachments | Accepted; attachment and actor sections superseded by 0008 and 0009 |
| [0007](0007-first-party-authentication.md) | First-party password and session authentication | Accepted |
| [0008](0008-files-and-documents.md) | Private files and documents (amended: lineage attachments, shared join factory, status ownership, sweep order, staged visibility) | Accepted |
| [0009](0009-authored-records-and-assignment.md) | Authored records, actor references and assignment | Accepted |
| [0010](0010-scripts-over-document-lineages.md) | Scripts over document lineages with exact-version provenance | Accepted |
| [0011](0011-finance-budget-model.md) | Finance money conventions and the budget version model (amended: finance plan, cash flow, overview, rebase policy) | Accepted |

Add an ADR only for a genuinely new durable decision; a change of rule inside an existing
decision is an amendment with a date, as in 0008 and 0011.
