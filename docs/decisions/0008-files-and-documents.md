# ADR 0008: Private files and documents

## Decision

Two domains, one boundary:

- **Files** own immutable bytes and their metadata. A `file_objects` row records a random
  storage key, the original filename (metadata only), the server-determined media type, size,
  SHA-256, the uploader and a lifecycle status. Bytes live in object storage behind the
  `FileStorage` interface (`put`, `open`, `delete`, `exists`); nothing above that interface
  knows whether the backend is a directory or a cloud bucket, and nothing anywhere produces a
  public URL. Downloads stream through the application after session authorization.
- **Documents** are business records over files: project, folder, title, status, notes, the
  uploader, an optimistic `version`, and a lineage. A new version is a new document row and a
  new file object; earlier versions and their bytes are never touched.

Attachment to other domains is by real foreign keys. A domain that needs documents adds a
join table (`<owner>_documents(owner_id, document_lineage_id)`) or a nullable
`document_lineage_id` column, both constrained to `documents.id`. There is no polymorphic
`attached_to` column: the earlier roadmap sketch was rejected because PostgreSQL could not
enforce it and every consumer would have had to re-validate it.

**Amendment (People milestone, 2026-09-13).** Owners reference the document *lineage id*
(the first version's `documents.id`) rather than a specific version, so adding a version never
detaches a document; reads resolve the current version. Owners create documents inside their
own transaction through `createDocumentInTransaction` exported by the Documents service, so
"upload and attach" is atomic and every document is born the same way. Detaching removes the
link only. `project_person_documents` is the reference implementation, documented in
ARCHITECTURE.md under "Attaching documents to a domain".

## Lifecycle and failure semantics

Object storage and PostgreSQL are not one transaction, so the order is fixed:

1. `POST /api/v1/files` streams the body through inspection (size limit, magic-number sniffing,
   SHA-256) straight into storage under a fresh random key. Only after the bytes are fully
   written is a `file_objects` row inserted with status `staged`. If that insert fails, the
   object is deleted (compensation) and the key logged. A row can therefore never point at
   bytes that were not completely stored.
2. A document command (`create`, `addVersion`) claims the staged file inside its own PostgreSQL
   transaction: `staged → available`, document row, audit event. Only the uploader (or an
   administrator) may claim a staged file, and a file backs at most one document version
   (unique index).
3. Staged files nobody claimed are retired by `sweepStagedUploads` after 24 hours: object
   deleted, row marked `deleted`. It is idempotent and safe to run at any time; scheduling it is
   an operational concern (a cron or a startup hook), not built here.
4. Documents are soft-deleted with their whole lineage; bytes are retained. Byte deletion is a
   retention decision to be made deliberately later.
5. If bytes go missing after the row exists (operator error, storage loss), download answers
   `502 FILE_UNAVAILABLE` and logs the file id; the row is never treated as proof of the object.

## Security

Keys are 32 random bytes and are validated by a strict pattern before any backend call, so a
key can neither be guessed nor traverse. Filenames are sanitised to a bare name and used only in
`Content-Disposition`. Media types come from the bytes; zip containers are accepted only as the
Office format their extension claims; executables and unknown binaries are refused with 415.
Downloads set `nosniff`, `no-store`, a sandboxing CSP, and `attachment` unless the caller asks
for `inline` on a PDF or image. Every request passes the session check; a staged file is visible
only to its uploader; available files are readable by every active user of the deployment (one
studio). Virus scanning or quarantine, if ever required, sits between step 1 and step 2: a
`scanned` status before `available`.

## Storage providers

`local`: a directory (development, tests, or a persistent volume), writing to a temp file and
hard-linking into place with exclusive create, so a partial write is never visible and an
object is never overwritten. Under `NODE_ENV=test` it refuses any root not named
`vault_test_storage_*`. `replit`: the production adapter over `@replit/object-storage`. It is a
bounded integration milestone: implement the four methods against the installed client, run
the shared storage contract tests against it where the environment allows, and verify on the
first fresh deployment. Until then `VAULT_STORAGE_PROVIDER=replit` fails closed at startup
rather than silently using the deployment filesystem, and production requires the provider to
be set explicitly.

## Consequences

- Scripts, legal records, rights, people, finance and distribution attach documents through
  foreign keys to this one model; none of them stores paths, blobs or filenames.
- Large files stream end to end; memory use per upload is bounded by the inspection window.
- The Replit object storage decision (this SDK versus an S3-compatible interface) is made when
  the adapter is implemented, with the contract tests as the acceptance criterion.
