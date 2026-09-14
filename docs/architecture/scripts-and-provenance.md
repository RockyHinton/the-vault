# Scripts and provenance

```
Script (stable identity, project-scoped)
  └─ Document lineage (owned by Documents)
       └─ exact Document version (UUID, version number)
            └─ immutable FileObject (SHA-256, size, sniffed media type)
                 ↑ annotations, and any future AI coverage, point here
```

## Model

A **Script** is a project business concept over exactly one Document lineage
(`scripts.document_lineage_id`, unique, a `documents.id`). Every screenplay revision is a
`documents` row in that lineage; the Documents domain owns version numbers, bytes, SHA-256,
uploader and status, and the Script owns project meaning and annotations. There is no
script-side version counter and today no mutable script field, so the script row has no
`version` column.

- **Identity and versions.** `POST /projects/:id/scripts` creates version 1 through
  `createDocumentInTransaction` (folder `script`) and the script row in one transaction;
  `POST …/scripts/:id/versions` adds N+1 through `addDocumentVersionInTransaction` with the
  current document's `version` as the concurrency guard. Reads resolve the lineage's live
  versions, oldest first; the current version is the row with `is_current`. A script whose
  lineage was deleted from the library disappears from the list. Removing a script soft-deletes
  the script row only; documents, bytes and notes stay.
- **Exact-version provenance.** A version is addressed by its document UUID and carries
  lineage id, version number, file id, byte size and SHA-256 in the `documentSchema` contract.
  **Future analysis (AI coverage, comparisons, commercial analysis) must reference the exact
  document version it analysed, never the script or the lineage**; a provenance record needs
  only `script_id`, `document_id` and the run's own metadata, with no change to this model.
- **Annotations** (`script_annotations`) bind to `document_id`, the exact version; the service
  verifies that document belongs to the script's lineage and project
  (`404 SCRIPT_VERSION_NOT_FOUND`). Page number and page-local x/y percentages are the reader's
  positioning; type and optional tag are enums. Author-or-admin edit and delete, versioned,
  soft-deleted, ordered by page then creation. Notes on v1 never appear on v2.
- **Supported format.** A script version must be a PDF: the service checks the staged
  file's server-detected media type before creating the document (`422
  SCRIPT_FORMAT_UNSUPPORTED`), for the first draft and every new version alike. This is a
  Scripts rule; the Files domain still stores every allowed type as an ordinary document.
  Final Draft or Office screenplays are added deliberately later, together with a reader.
- **Reader.** `pdfjs-dist` renders pages to a canvas from bytes fetched through
  `GET /files/:id/content` with the session cookie; the worker is bundled as a same-origin
  asset. No object URL, no public link, no storage key leaves the server.
- **Authorization.** Any active user reads, uploads a first draft and annotates; a new version
  follows the Documents rule (the current version's uploader or a studio_admin); removing a
  script or another author's note is creator-or-admin. While the script is live, the Documents
  library refuses to delete its lineage, add a version to it or move it out of the `script`
  folder (`409 DOCUMENT_BACKS_SCRIPT`), so the Script command is the only path to a new version
  and the PDF rule is never bypassed; title, status and notes remain library edits. Once the
  Script page removes the script, the lineage is an ordinary document again.
- **Audit vocabulary:** `script.created|version_added|deleted` (alongside the Documents
  domain's own `document.created|version_added`) and
  `script_annotation.created|updated|deleted`.

## Future AI coverage

An AI coverage record needs only `script_id`, `document_id` (the exact version it analysed)
and its own result metadata. Everything it must reference already exists and is immutable:
the script row survives soft-deletion for provenance, `documents.id` is a stable primary key
with `restrict` on every foreign key, and `documents_file_object_id_unique` guarantees one
immutable file per version. Do not invent a new script or file version model for it; add a
table that references the exact document version, and read bytes through the Files domain.
