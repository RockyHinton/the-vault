# ADR 0010: Scripts over document lineages, with exact-version provenance

Date: 2026-09-13. Status: accepted.

## Context

The prototype identified screenplays by a category id or the word "script" in a title, kept
its own version counter, rendered three hardcoded pages, and attached notes to fixture ids.
Future work (AI coverage, draft comparison, commercial analysis) must be able to say which
exact bytes it analysed, and human notes must never drift from one draft to the next.

## Decision

1. **A Script is a row over one Document lineage.** `scripts.document_lineage_id` is unique
   and references `documents.id`. Screenplay revisions are Document versions; Scripts add no
   second version model, no copied metadata and no separate file handling.
2. **Documents own every version fact**: number, immutable bytes, SHA-256, uploader, status.
   Scripts own project meaning, the stable identity across revisions, and annotations.
3. **Exact-version provenance is mandatory.** Anything written *about* a screenplay
   (annotations today; analysis runs later) references the exact `documents.id`, never the
   script or the lineage, and the service checks that the version belongs to the script.
4. **The reader renders stored bytes** fetched through the authenticated file route with
   `pdfjs-dist`; there is no public URL, no persisted object URL and no fake content.
   PDF is the only supported screenplay format today, enforced by the Scripts service on
   the file's server-detected media type (`422 SCRIPT_FORMAT_UNSUPPORTED`); other formats
   are a deliberate later addition with their own reader, not a Files policy change.
5. **Creation and versioning compose the Documents domain** in one transaction
   (`createDocumentInTransaction`, `addDocumentVersionInTransaction`), so a failed script
   command leaves no document and a failed version leaves the current version untouched.
6. **Removal is soft and narrow.** Removing a script hides the script; documents, bytes and
   notes are retained. Individual old versions cannot be deleted from the Script page.

## Consequences

- Future AI coverage stores `(script_id, document_id, timestamp, provider/model/prompt
  metadata)` and can always resolve version number, checksum and bytes; no schema change to
  Scripts, Documents or Files is required.
- Multiple scripts per project are allowed by the schema; the workspace shows one screenplay
  flow until the product needs more.
- `pdfjs-dist` is a client dependency; the worker ships as a same-origin asset, compatible
  with the production Content Security Policy.
