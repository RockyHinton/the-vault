# Domain reference

Compact rules for domains that have no dedicated guide. The pattern they all follow is in
[domain-pattern.md](domain-pattern.md); the reference implementation to read first is People.

## Projects reference domain

Projects persist core identity, metadata, active stage, archive metadata, optimistic `version`,
and soft deletion timestamp. Stage change, archive, restore, and delete are explicit operations.
Each state transition and audit event is committed in the same transaction. Deletion is soft to
retain provenance; it is hidden from all product reads and writes. Lists are cursor-paginated
and fetch one extra row so `nextCursor` is set only when more rows exist.

Users & Access is the second reference domain and follows the same shape.

## Distribution

A **Distribution Territory** (`distribution_territories`) is one project-scoped market
workspace: the team's own name for the market, its commercial status, descriptive deal
information, authored notes and attached agreements. It is the reference shape for a
commercial record that carries free-text terms rather than ledger entries.

- **Identity.** Territories are user-named (the product works in markets such as "United
  Kingdom" or "Rest of World"), so there is no fixed taxonomy. A name is unique within its
  project ignoring case: the service answers `409 TERRITORY_NAME_TAKEN` and a partial unique
  index on `(project_id, lower(name)) WHERE deleted_at IS NULL` enforces it. Soft deletion
  frees the name. Ordering is creation order.
- **Status** (`distribution_territory_status`: `available`, `in_discussion`, `licensed`,
  `delivered`, `closed`) changes only through `POST …/territories/:id/status`; `PATCH`
  rejects it. The product has no transition rules and no state implies immutability, so none
  are enforced; a repeated status is `409 STATUS_UNCHANGED`.
- **Deal information is text, not money.** `distributor`, `contact`, `signature_payment`,
  `delivery_payment` and `general_notes` are nullable text columns edited together through
  `PATCH` (blank clears). The product records terms such as "20% on signature" and never
  calculates with them, so the Finance money convention is deliberately not applied here.
  Exact amounts and currency would be new columns beside these fields, not a reinterpretation
  of them.
- **Notes** (`distribution_territory_notes`) are authored records under the territory:
  session author, author-or-admin edit and delete, `edited_at` once changed, soft delete,
  newest first. They are not Project Notes.
- **Documents** attach through `distribution_territory_documents` (owner convention, folder
  `distribution`, lineage-based so new versions stay attached). Detach is creator-or-admin;
  document status stays with Documents.
- **Authorization.** Any active user creates territories, renames them, edits deal
  information, changes status, writes notes and attaches documents. Removing a territory or
  detaching a document is creator-or-admin (`created_by_user_id` from the session).
- **Concurrency.** The territory and each note carry their own `version`; deal edits are
  saved as one compare-and-set write from an explicit Save, so field-by-field races do not
  arise. Stale writes are `409 VERSION_CONFLICT` with no side effects.
- **Reads.** `GET …/territories` returns summaries with live note and document counts (two
  grouped queries); `GET …/territories/:id` returns the full territory; every command
  returns the full territory.
- **Out of scope by decision:** royalties, revenue, payments, invoicing, FX, and links to
  Rights or Legal records: the current product has no writer for any of them.
- **Audit vocabulary:** `distribution_territory.created|updated|status_changed|deleted|
  document_attached|document_detached` (rename records from and to, status records from and
  to) and `distribution_territory_note.created|updated|deleted`.

## Rights and legal records

Three concepts stay distinct: a **Right** or **Legal Record** is the business entity and its
metadata; a **Document** is the versioned Vault record it attaches; a **FileObject** is the
immutable bytes behind one document version.

- **Rights** (`project_rights`): type, holder, expiry (`date`), notes, creator, version, soft
  delete. Nothing is created implicitly; an empty project has no rights items. The one product
  rule is stage-scoped vocabulary: `rightsStatusesByStage` in
  `shared/contracts/rights-status.ts` lists which statuses belong to evaluation, development and
  production; `POST …/rights/:id/status` accepts only a status of the project's current stage
  (`422 STATUS_NOT_ALLOWED_FOR_STAGE`), and a status set in an earlier stage stays readable
  until changed. The page-level position (cleared, at risk, in progress) is
  `summarizeRightsForStage`, computed wherever it is shown. There are no transition rules
  between statuses and no coupling to project stage transitions.
- **Legal records** (`legal_records`): one aggregate for the eleven documentation categories
  (`legal_category` enum), with typed `name` and `notes` and a `details` JSONB column
  validated by `legalDetailsSchema`, a discriminated union with one object schema per
  category. PostgreSQL checks that `details.category` equals the row's category, that details
  is an object and that the name is not blank; the category is immutable. Money inside details
  is a decimal string with a currency enum; Finance will own real ledgers later.
- **No stored legal status.** A record is *confirmed* when it has at least one attached
  document and every attached document's current version is `signed` or `final`; a category is
  empty, in progress or completed from its records (`shared/contracts/legal-completion.ts`,
  unit-tested, used by the overview, the category page and Development readiness). The UI
  labels the document statuses Draft, Pending (`under_review`), Signed and Approved (`final`)
  and edits them through the Documents update, so only a document's uploader or an admin moves
  a legal record towards confirmation.
- **Authorization** mirrors People: any active user records, edits, moves status and attaches;
  removing a record or detaching a document is creator-or-admin.
- **Audit vocabulary:** `right.created|updated|status_changed|deleted|document_attached|
  document_detached` and `legal_record.created|updated|deleted|document_attached|
  document_detached`.

## People

`server/modules/people` is the compact reference implementation for a normal project
domain: producers and creatives as one aggregate (`project_people`, discriminated by `kind`),
typed JSONB sub-records for contacts and links validated by the contract, an explicit
`POST …/people/:id/status` command (`person.status_changed`), collaborative edits,
creator-or-admin removal and detach, documents attached by lineage, and a full integration
suite covering scoping, policy, constraints and audit. Its client feature module
(`client/src/features/people`) shows the typed API, keys, hooks and labels convention.

## Evaluation, notes and tasks

The three authored-record domains of the Evaluation stage (ADR 0009): notes and tasks are
per-author records listed for the whole team (author-or-admin edit and delete, soft-deleted);
tasks add assignment by foreign key and collaborative complete/reopen commands; reviews are
one per author per project (`PUT …/reviews/mine`, `version: 0` creates) with the
recommendation derived on the server; the evaluation profile is a 1:1 project aggregate that
only a studio_admin writes. Details and audit vocabulary are in
[auth-and-authorization.md](auth-and-authorization.md#authored-records-actors-and-assignment).
