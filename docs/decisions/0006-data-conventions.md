> **HISTORICAL / PARTLY SUPERSEDED — DO NOT IMPLEMENT THE OLD ACTOR OR ATTACHMENT
> MODELS BELOW.** The attachment model (`attached_to_type` / `attached_to_id`
> and `supersedes_document_id`) was replaced by ADR 0008: documents form lineages and owners
> attach through per-owner join tables keyed by lineage id. The actor shape below
> (`{ id, displayName, email }`) was replaced by ADR 0009: business contracts carry
> `UserRef = { id, displayName }` and never an email. Money and date conventions stand.
> Kept for history.

# ADR 0006: Data conventions for authored records, money, dates and attachments

## Decision

**Authorship.** Every durable business record carries `created_by_user_id` referencing
`application_users` (ON DELETE RESTRICT). Ordinary users may create, edit and delete their own
authored records where the domain allows it (notes, tasks, reviews); a studio_admin may manage
all records. Lifecycle and administrative commands (stage transitions, archive, restore, delete,
budget approval, user management) are studio_admin-only unless a domain explicitly decides
otherwise and records that decision. Contracts expose the author as
`actor: { id, displayName, email }` resolved by the service, never as a raw foreign key alone.

**Money.** PostgreSQL `numeric(14,2)`; Drizzle `numeric` (a string in TypeScript); decimal
strings such as `"125000.00"` in API contracts; formatting and arithmetic for display happen in
the client. JavaScript floating point is never the authoritative representation of money.
Currency is a separate ISO 4217 column on the owning aggregate (for finance, the project's
finance settings), never assumed.

**Dates.** Timestamps are `timestamptz` persisted in UTC and serialised as ISO 8601 strings.
Date-only values (expiry, due, expected) are PostgreSQL `date` columns serialised as
`YYYY-MM-DD` and are never converted through a timezone.

**Attachments.** One `documents` domain owns every file reference in the product. A document row
belongs to a project, points at an immutable `file_objects` row (random non-public storage key,
MIME, size, sha256), and may be attached to one owning entity through an enum-constrained
`attached_to_type` plus `attached_to_id`, validated by the documents service against the owning
domain. Versions form a chain through `supersedes_document_id` with an explicit current marker.
No domain stores file paths, blob URLs or filenames of its own.

## Rationale

These are the four places where the prototype diverged most: authorship was a fixed fake user,
money was floating point in three formats, expected dates were free text that broke cash-flow
maths, and files were modelled seven different ways. Fixing them once, before the domains are
copied from Projects, is cheaper than fixing them nine times.

## Consequences

- Services resolve actors; repositories never join for display.
- Finance contracts will change from numbers to decimal strings when that domain is migrated.
- The Files and Documents milestone implements the attachment convention; until then no domain
  introduces its own document table.
