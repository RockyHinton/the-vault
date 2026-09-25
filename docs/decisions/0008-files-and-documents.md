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
docs/architecture/files-and-documents.md under "Attaching documents to a domain".

**Amendment (Rights + Legal milestone, 2026-09-13).** With three owners the join-table
persistence became one narrow factory, `createAttachmentRepository`, restricted to the listed
join tables; it is persistence only. Document status stays Documents-domain state with a single
mutation path (the Documents update, uploader-or-admin, one `document.updated` event); owners
such as Legal derive from it and expose no status command of their own. The ADR's original
rule stands: no polymorphic column, no paths or URLs on owners, bytes only through the Files
domain.

**Amendment (Canonical V1 remediation, 2026-09-14).** Two statements below are refined by the
implementation. (1) Sweep order: `sweepStagedUploads` moves a row `staged → deleted` by
compare-and-set (still staged, still older than the cutoff) *before* deleting bytes, and deletes
bytes only for rows it retired, so it is safe to run concurrently with document claims; a
failed byte delete leaves a logged orphan object, never a live row without bytes. Scheduling the
sweep remains deployment work. (2) Staged visibility: a staged file is visible and claimable by
its uploader or a studio_admin, not the uploader alone. Current rules live in
`docs/architecture/files-and-documents.md`.

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
`vault_test_storage_*`.

`replit`: Replit App Storage, `server/files/replit-file-storage.ts` over
`@replit/object-storage`. Production requires `VAULT_STORAGE_PROVIDER` to be set explicitly,
and any provider other than `local` requires `VAULT_STORAGE_BUCKET`, so a deployment cannot
inherit another environment's object store. `VAULT_STORAGE_PREFIX` optionally namespaces keys
within a bucket.

**Amendment (Replit provider readiness, 2026-09-25).** The adapter now exists; the earlier
statement that `@replit/object-storage` was "the installed client" was written ahead of the
dependency and is corrected here — it was added with this change. Three provider facts were
verified against the installed SDK (v1.0.0) and its current documentation rather than
assumed, and they are the reason the adapter is shaped the way it is:

1. Uploads overwrite, and there is **no conditional or exclusive-create option** on any
   upload method. Exclusivity is therefore an `exists` check before the upload: best-effort,
   not atomic. Two concurrent writers of one key could both pass it. Vault keys are 32
   cryptographically random server-generated bytes used once, so this is not a practical
   risk, but it is a genuinely weaker guarantee than the `local` adapter's.
2. `uploadFromStream` pipes the caller's stream into the provider's write stream, and `pipe`
   does not forward a source failure to the destination, so its promise can remain pending
   forever when a client aborts mid-upload. The adapter races the upload against the source's
   own `error` event and then deletes the partial object, so `FileService.stageUpload` cannot
   hang. An error raised by the source (including the upload inspector's own size and
   media-type rejections) is re-raised unchanged, so a refused upload stays 413/415 and does
   not become a 500.
3. `downloadAsStream` returns synchronously and reports a missing object asynchronously on
   the stream, so `open` checks existence first to honour its contract and still translates a
   late provider error on the stream it returns.

Compression is disabled on upload and decompression left enabled on download, so bytes
round-trip exactly: `file_objects.byte_size` is the `Content-Length` the download route
sends, and `sha256` is verified against the original bytes.

The acceptance criterion is unchanged and still outstanding: the shared contract suite
(`tests/support/storage-contract.ts`) must pass against a real bucket. It cannot run outside
Replit, because the SDK obtains credentials from a workspace-local sidecar, so it lives in
`tests/storage/replit-file-storage.live.test.ts` and skips unless
`VAULT_REPLIT_LIVE_STORAGE_BUCKET` names a development bucket. Locally, the adapter's own
translation layer — key validation, prefixing, exclusive create, error mapping, compensation,
the hang guard — is unit-tested against a fake client with the SDK's types
(`tests/unit/replit-file-storage.test.ts`). That proves the adapter, not the provider.

## Consequences

- Scripts, legal records, rights, people, finance and distribution attach documents through
  foreign keys to this one model; none of them stores paths, blobs or filenames.
- Large files stream end to end; memory use per upload is bounded by the inspection window.
- The Replit object storage decision (this SDK versus an S3-compatible interface) is settled in
  favour of `@replit/object-storage`: it is the platform's supported client, needs no
  credentials in the environment (it reads them from the workspace), and fits the four-method
  interface directly. A different host would add a sibling adapter rather than change anything
  above `server/files`. The contract tests remain the acceptance criterion.
