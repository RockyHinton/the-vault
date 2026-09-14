import { randomUUID } from "node:crypto";
import type {
  AddDocumentVersionInput,
  CreateDocumentInput,
  Document,
  DocumentFolder,
  UpdateDocumentInput,
} from "@shared/contracts";
import type { FileObjectRow } from "@shared/schema";
import type { Database } from "../../db/client";
import type { Transaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { appendAuditEvent } from "../audit/audit-repository";
import { withLiveProjectTransaction } from "../projects/live-project";
import { fileRepository } from "../files/file-repository";
import { projectRepository } from "../projects/project-repository";
import { scriptRepository } from "../scripts/script-repository";
import { toDocumentContract } from "./document-contract";
import {
  documentRepository,
  type DocumentEditableFields,
  type DocumentRecord,
} from "./document-repository";

export interface DocumentActor {
  userId: string;
  role: "studio_admin" | "user";
  requestId: string;
}

/** The mapper lives in `document-contract.ts`; re-exported for owners that already import it here. */
export { toDocumentContract };

function requireDocument(record: DocumentRecord | undefined): DocumentRecord {
  if (!record)
    throw new ApiError(
      404,
      "DOCUMENT_NOT_FOUND",
      "The document was not found.",
    );
  return record;
}

function requireFresh<T>(row: T | undefined): T {
  if (!row)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "This document changed while you were working. Refresh and try again.",
    );
  return row;
}

/** Authorship convention: the uploader manages their own document; admins manage all. */
function assertCanManage(actor: DocumentActor, record: DocumentRecord): void {
  if (actor.role === "studio_admin") return;
  if (record.document.createdByUserId === actor.userId) return;
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Only the uploader or a studio administrator can change this document.",
  );
}

/**
 * Superseded versions are history. Their metadata (title, folder, status,
 * notes) defines the record as it was and is never rewritten; only the
 * current version of a lineage is edited, versioned or deleted.
 */
function assertCurrent(record: DocumentRecord, message: string): void {
  if (!record.document.isCurrent)
    throw new ApiError(409, "NOT_CURRENT_VERSION", message);
}

/**
 * The staged upload a document command may claim: it must exist, still be
 * staged, and belong to the caller (or the caller is an admin). Any other
 * case is one uniform answer, so a file id never reveals whether it exists,
 * whose it is, or what it contains. Owning domains that need to inspect the
 * file before creating a document (Scripts checks the media type) call this
 * first, so the ownership answer always comes before any format answer.
 */
export async function requireClaimableStagedFile(
  tx: Transaction,
  fileObjectId: string,
  actor: DocumentActor,
): Promise<FileObjectRow> {
  const file = await fileRepository.findById(tx, fileObjectId);
  if (
    !file ||
    file.status !== "staged" ||
    (file.createdByUserId !== actor.userId && actor.role !== "studio_admin")
  ) {
    throw new ApiError(
      422,
      "FILE_NOT_CLAIMABLE",
      "Upload the file first, then attach it; a file can back only one document version.",
    );
  }
  return file;
}

/** Claims a staged upload for a document inside the caller's transaction. */
async function claimStagedFile(
  tx: Transaction,
  fileObjectId: string,
  actor: DocumentActor,
) {
  const file = await requireClaimableStagedFile(tx, fileObjectId, actor);
  return requireFresh(
    await fileRepository.markAvailable(tx, file.id, new Date()),
  );
}

async function requireProject(
  executor: Transaction | Database,
  projectId: string,
) {
  const project = await projectRepository.findById(executor, projectId);
  if (!project)
    throw new ApiError(404, "PROJECT_NOT_FOUND", "The project was not found.");
  return project;
}

/**
 * Creates version 1 of a document inside the caller's transaction: claims the
 * staged file, inserts the row, appends `document.created`. The HTTP create
 * command and owning domains that attach a document in the same unit of work
 * (for example a person's profile document) both go through here, so every
 * document is born the same way.
 */
export async function createDocumentInTransaction(
  tx: Transaction,
  input: {
    projectId: string;
    document: CreateDocumentInput;
    actor: DocumentActor;
  },
): Promise<Document> {
  const { projectId, document, actor } = input;
  const id = randomUUID();
  const file = await claimStagedFile(tx, document.fileObjectId, actor);
  const row = await documentRepository.insert(tx, {
    id,
    projectId,
    lineageId: id,
    versionNumber: 1,
    fileObjectId: file.id,
    folder: document.folder,
    title: document.title,
    status: document.status,
    notes: document.notes || null,
    createdByUserId: actor.userId,
  });
  await appendAuditEvent(tx, {
    actorUserId: actor.userId,
    action: "document.created",
    entityType: "document",
    entityId: row.id,
    requestId: actor.requestId,
    metadata: {
      projectId,
      folder: document.folder,
      fileObjectId: file.id,
      sha256: file.sha256,
    },
  });
  return toDocumentContract(
    requireDocument(
      await documentRepository.findById(tx, { projectId, documentId: id }),
    ),
  );
}

/**
 * Adds version N+1 to a lineage inside the caller's transaction: retires the
 * current row (compare-and-set on its version), claims the new file, inserts
 * the new row, appends `document.version_added`. The HTTP command and owning
 * domains (Scripts) both go through here, so one rule holds everywhere: only
 * the current version's uploader or a studio administrator may add a version,
 * the same ownership that governs metadata edits and deletion. The old
 * version and bytes are untouched.
 */
export async function addDocumentVersionInTransaction(
  tx: Transaction,
  input: {
    projectId: string;
    documentId: string;
    version: AddDocumentVersionInput;
    actor: DocumentActor;
  },
): Promise<Document> {
  const { projectId, documentId, version, actor } = input;
  const id = randomUUID();
  const current = requireDocument(
    await documentRepository.findById(tx, { projectId, documentId }),
  );
  assertCurrent(
    current,
    "New versions are added to the current version of a document.",
  );
  assertCanManage(actor, current);
  requireFresh(
    await documentRepository.retireCurrent(tx, {
      id: current.document.id,
      expectedVersion: version.version,
    }),
  );
  const file = await claimStagedFile(tx, version.fileObjectId, actor);
  const next = await documentRepository.insert(tx, {
    id,
    projectId,
    lineageId: current.document.lineageId,
    versionNumber: current.document.versionNumber + 1,
    fileObjectId: file.id,
    folder: current.document.folder,
    title: current.document.title,
    status: version.status,
    notes: version.notes ?? current.document.notes,
    createdByUserId: actor.userId,
  });
  await appendAuditEvent(tx, {
    actorUserId: actor.userId,
    action: "document.version_added",
    entityType: "document",
    entityId: next.id,
    requestId: actor.requestId,
    metadata: {
      projectId,
      lineageId: next.lineageId,
      versionNumber: next.versionNumber,
      previousDocumentId: current.document.id,
      fileObjectId: file.id,
      sha256: file.sha256,
    },
  });
  return toDocumentContract(
    requireDocument(
      await documentRepository.findById(tx, { projectId, documentId: id }),
    ),
  );
}

/**
 * Documents use-cases. Each command is one transaction over PostgreSQL only;
 * the bytes were already stored by the Files domain before the command runs,
 * so the command either records the document or changes nothing.
 */
export function createDocumentService({ db }: { db: Database }) {
  return {
    async list(projectId: string, input: { folder?: DocumentFolder }) {
      await requireProject(db, projectId);
      const rows = await documentRepository.listCurrent(db, {
        projectId,
        folder: input.folder,
      });
      return rows.map(toDocumentContract);
    },

    /** The requested version plus every live version of its lineage. */
    async get(projectId: string, documentId: string) {
      await requireProject(db, projectId);
      const record = requireDocument(
        await documentRepository.findById(db, { projectId, documentId }),
      );
      const versions = await documentRepository.listLineage(
        db,
        record.document.lineageId,
      );
      return {
        document: toDocumentContract(record),
        versions: versions.map(toDocumentContract),
      };
    },

    async create(
      projectId: string,
      input: CreateDocumentInput,
      actor: DocumentActor,
    ): Promise<Document> {
      return withLiveProjectTransaction(db, projectId, (tx) =>
        createDocumentInTransaction(tx, { projectId, document: input, actor }),
      );
    },

    async addVersion(
      projectId: string,
      documentId: string,
      input: AddDocumentVersionInput,
      actor: DocumentActor,
    ): Promise<Document> {
      return withLiveProjectTransaction(db, projectId, (tx) =>
        addDocumentVersionInTransaction(tx, {
          projectId,
          documentId,
          version: input,
          actor,
        }),
      );
    },

    async update(
      projectId: string,
      documentId: string,
      input: UpdateDocumentInput,
      actor: DocumentActor,
    ): Promise<Document> {
      const { version, ...changes } = input;
      const values: DocumentEditableFields = {
        title: changes.title,
        folder: changes.folder,
        status: changes.status,
        notes: changes.notes === undefined ? undefined : changes.notes || null,
      };
      const changedFields = (
        Object.keys(values) as (keyof DocumentEditableFields)[]
      ).filter((key) => values[key] !== undefined);
      const record = await withLiveProjectTransaction(
        db,
        projectId,
        async (tx) => {
          const existing = requireDocument(
            await documentRepository.findById(tx, { projectId, documentId }),
          );
          assertCurrent(
            existing,
            "Superseded versions are history; edit the current version.",
          );
          assertCanManage(actor, existing);
          requireFresh(
            await documentRepository.updateFields(tx, {
              id: existing.document.id,
              expectedVersion: version,
              values,
            }),
          );
          await appendAuditEvent(tx, {
            actorUserId: actor.userId,
            action: "document.updated",
            entityType: "document",
            entityId: existing.document.id,
            requestId: actor.requestId,
            metadata: { projectId, changedFields },
          });
          return requireDocument(
            await documentRepository.findById(tx, { projectId, documentId }),
          );
        },
      );
      return toDocumentContract(record);
    },

    /**
     * Soft-deletes the whole lineage. Bytes are retained (no byte deletion
     * yet). A lineage that is the identity of a live Script is refused: the
     * Script domain owns that removal (`DELETE …/scripts/:id`, creator-or-admin,
     * `script.deleted`), and a generic library command must not perform it.
     */
    async delete(
      projectId: string,
      documentId: string,
      version: number,
      actor: DocumentActor,
    ): Promise<void> {
      await withLiveProjectTransaction(db, projectId, async (tx) => {
        const existing = requireDocument(
          await documentRepository.findById(tx, { projectId, documentId }),
        );
        assertCurrent(
          existing,
          "Superseded versions are history; delete the document from its current version.",
        );
        assertCanManage(actor, existing);
        if (
          await scriptRepository.findLiveByLineage(
            tx,
            existing.document.lineageId,
          )
        )
          throw new ApiError(
            409,
            "DOCUMENT_BACKS_SCRIPT",
            "This document is the project's script. Remove the script from the Script page first.",
          );
        const deletedAt = new Date();
        requireFresh(
          await documentRepository.softDeleteCurrent(tx, {
            id: existing.document.id,
            expectedVersion: version,
            deletedAt,
          }),
        );
        const others = await documentRepository.softDeleteLineage(tx, {
          lineageId: existing.document.lineageId,
          deletedAt,
        });
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "document.deleted",
          entityType: "document",
          entityId: existing.document.id,
          requestId: actor.requestId,
          metadata: {
            projectId,
            lineageId: existing.document.lineageId,
            versionsDeleted: others + 1,
          },
        });
      });
    },
  };
}

export type DocumentService = ReturnType<typeof createDocumentService>;
