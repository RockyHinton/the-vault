# Files and documents

```
FileObject   immutable private bytes: random storage key, sniffed media type, size, SHA-256, uploader
Document     a project-scoped business record over one FileObject: folder, title, status, notes,
             version, and a lineage in which each new version is a new row and a new file
Attachment   a join row from an owning record to the document *lineage* (never to a version)
```

## Model and lifecycle

Two domains, one boundary (ADR 0008). **Files** (`server/modules/files`, `server/files`)
own immutable bytes: a `file_objects` row per upload with a random storage key, original
filename (metadata only), server-detected media type, size, SHA-256, uploader and a lifecycle
status (`staged` → `available` → `deleted`). **Documents** (`server/modules/documents`) are
project-scoped business records over a file: folder, title, status, notes, uploader, optimistic
`version`, and a lineage in which each new version is a new row and a new file.

```
POST /files                       raw body → inspect (size, magic bytes, sha256) → storage.put(key)
                                  → file_objects row (staged). Insert failure deletes the object.
POST /projects/:id/documents      one transaction: claim staged file (→ available), insert
                                  document, audit. Only the uploader (or an admin) may claim.
POST …/documents/:id/versions     one transaction: retire current (compare-and-set), claim new
                                  file, insert version N+1 in the same lineage, audit.
                                  Uploader-or-admin of the current version, on every route.
PATCH …/documents/:id             metadata edit of the current version only, compare-and-set,
                                  uploader-or-admin, audit. Superseded versions are history and
                                  are never rewritten (409 NOT_CURRENT_VERSION).
DELETE …/documents/:id            soft-delete the lineage, bytes retained, audit.
GET  /files/:id/content           session check → stream bytes; attachment by default,
                                  inline only for PDF/images; nosniff, no-store, sandbox CSP.
```

Storage sits behind `FileStorage` (`put`, `open`, `delete`, `exists`) in
`server/files/file-storage.ts`; `storage-factory.ts` is the only place provider names appear.
The `local` adapter is a directory with exclusive-create semantics; `replit` is a bounded
production milestone that fails closed until implemented. Keys are random and validated by
pattern before any backend call; nothing produces a URL; no bytes are stored in PostgreSQL.

Object storage and PostgreSQL are not one transaction. The order above guarantees a row never
points at bytes that were not fully written; unclaimed staged uploads are retired by
`sweepStagedUploads` after 24 hours (row retired by compare-and-set first, bytes deleted only
for rows the sweep retired, so a concurrently claimed file keeps its bytes; the sweep is not
scheduled by the application); a row is never treated as proof of the object (missing
bytes answer `502 FILE_UNAVAILABLE`).

**Attachment convention.** A domain that needs documents references `documents.id` with a
real foreign key: a join table `<owner>_documents(owner_id, document_lineage_id)` for many, or
a nullable `document_lineage_id` column for one. There is no polymorphic `attached_to`. No
domain stores paths, blob URLs or filenames of its own, and no domain calls `FileStorage`
directly: it creates documents through the Documents service and lets the Files domain own
the bytes. The full rule set is in "Attaching documents to a domain" below.

## Attaching documents to a domain

People, Rights, Legal Records, Budget departments, Finance sources and Distribution territories
attach documents the same way: six join tables, one convention. Copy it for any owner that
carries documents; never add a second upload path.

- **Reference the lineage.** The join column is `document_lineage_id`, a foreign key to
  `documents.id` that stores the lineage id (the first version's id). A new version keeps the
  attachment, and reads resolve the *current* version with
  `documentRepository.listCurrentByLineages`. Never store a version-specific id on an owner.
- **One join repository, created per owner.** `createAttachmentRepository({ table,
  ownerColumn, ownerKey })` in `server/modules/documents/document-attachments.ts` gives an
  owner its `listByOwners`, `find`, `insert`, `delete` and `loadDocumentsByOwner` over its join
  table (the schema's shared `attachmentColumns`). The accepted tables are listed in that file,
  so adding an owner is a reviewed change, not a generic framework. Policy, audit vocabulary and
  the folder choice stay in the owning service.
- **The owner's service composes, the Documents domain creates.** Upload-and-attach is one
  owner command (`POST /projects/:id/people/:personId/documents`, and the same shape under
  `rights` and `legal-records`) whose transaction calls `createDocumentInTransaction(tx, …)`
  from `server/modules/documents` and then inserts the join row. The document is created in the owner's workspace folder and appears in the library
  like any other; the Documents domain writes `document.created`, the owner writes
  `<owner>.document_attached`. If the link fails, the transaction rolls back and the staged
  file is swept later; nothing half-attached exists.
- **Attach existing, detach, delete.** `PUT …/documents/:documentId` links an existing document
  of the same project by any of its version ids; `DELETE …/documents/:documentId` removes the
  link only. A lineage already linked is `409 DOCUMENT_ALREADY_ATTACHED`: the owner pre-checks,
  and the join repository's `insert` maps a concurrent duplicate on the table's primary key to
  the same 409, so owners never add their own race handling. Deleting the owner soft-deletes the owner and leaves documents, versions and bytes
  untouched. Document metadata, versions and deletion continue to go through the Documents
  routes and their uploader-or-admin policy.
- **Contracts embed the current version.** The owner's contract carries
  `documents: Document[]` (the shared `documentSchema`), loaded with one link query and one
  document query per list, never per row.
- **Privacy is unchanged.** Bytes are still served only by `GET /files/:id/content` after the
  session check; nothing on the owner is a URL or a path.
- **Document status is Documents-domain state.** Draft, under review, final and signed are the
  lifecycle of every document in every folder. They change only through
  `PATCH /projects/:id/documents/:documentId` under the uploader-or-admin rule and produce one
  `document.updated` event; no owner exposes a second status command. Owners whose workflow
  depends on it (Legal) derive from the current versions and never write `documents` rows.
- **Client.** `OwnerDocumentList` (`client/src/components/documents`) renders the attached
  list, upload-and-attach and detach for any owner; `ownerDocumentApi(schema)` types the three
  commands against the owner's contract.

## Rules a future agent must not break

- Only the Files domain touches bytes; only the Documents domain creates document rows.
- A new version is added only by the current version's uploader or a studio_admin,
  whichever route reaches the primitive (Scripts included).
- Superseded versions are history: their metadata is never rewritten and they are never
  deleted individually (`409 NOT_CURRENT_VERSION`).
- Document status has one owner (the Documents PATCH); owners derive meaning from it.
- A lineage that is the identity of a live Script belongs to the Scripts domain: the library
  refuses to delete it, add a version to it or move it out of the `script` folder
  (`409 DOCUMENT_BACKS_SCRIPT`, before anything is claimed, retired or audited). New drafts go
  through the Script page, which applies the Scripts format rule; the Script page removes the
  script first. Title, status and notes stay editable in the library, and once the script is
  removed the lineage is an ordinary document again.
- No contract ever carries a storage key, a path or a URL to bytes.
- The storage provider is chosen once in `server/files/storage-factory.ts`; a new adapter
  implements `FileStorage` and passes `tests/support/storage-contract.ts`.
