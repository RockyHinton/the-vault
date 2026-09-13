import { randomUUID } from "node:crypto";
import type {
  AddDocumentVersionInput,
  CreateDocumentInput,
  Document,
  DocumentFolder,
  DocumentStatus,
  UpdateDocumentInput,
} from "@shared/contracts";
import type { Database } from "../../db/client";
import { withTransaction, type Transaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { appendAuditEvent } from "../audit/audit-repository";
import { fileRepository } from "../files/file-repository";
import { toFileObjectContract } from "../files/file-service";
import { projectRepository } from "../projects/project-repository";
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

function toContract(record: DocumentRecord): Document {
  const { document, file, createdBy } = record;
  return {
    id: document.id,
    projectId: document.projectId,
    lineageId: document.lineageId,
    versionNumber: document.versionNumber,
    isCurrent: document.isCurrent,
    folder: document.folder as DocumentFolder,
    title: document.title,
    status: document.status as DocumentStatus,
    notes: document.notes,
    file: toFileObjectContract(file),
    createdBy,
    version: document.version,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

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
 * Claims a staged upload for a document inside the caller's transaction.
 * Only the uploader (or an admin) may claim; only staged files can be claimed.
 */
async function claimStagedFile(
  tx: Transaction,
  fileObjectId: string,
  actor: DocumentActor,
) {
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
  return requireFresh(
    await fileRepository.markAvailable(tx, file.id, new Date()),
  );
}

async function requireProject(tx: Transaction, projectId: string) {
  const project = await projectRepository.findById(tx, projectId);
  if (!project)
    throw new ApiError(404, "PROJECT_NOT_FOUND", "The project was not found.");
  return project;
}

/**
 * Documents use-cases. Each command is one transaction over PostgreSQL only;
 * the bytes were already stored by the Files domain before the command runs,
 * so the command either records the document or changes nothing.
 */
export function createDocumentService({ db }: { db: Database }) {
  return {
    async list(projectId: string, input: { folder?: DocumentFolder }) {
      const rows = await documentRepository.listCurrent(db, {
        projectId,
        folder: input.folder,
      });
      return rows.map(toContract);
    },

    /** The requested version plus every live version of its lineage. */
    async get(projectId: string, documentId: string) {
      const record = requireDocument(
        await documentRepository.findById(db, { projectId, documentId }),
      );
      const versions = await documentRepository.listLineage(
        db,
        record.document.lineageId,
      );
      return {
        document: toContract(record),
        versions: versions.map(toContract),
      };
    },

    async create(
      projectId: string,
      input: CreateDocumentInput,
      actor: DocumentActor,
    ): Promise<Document> {
      const id = randomUUID();
      const record = await withTransaction(db, async (tx) => {
        await requireProject(tx, projectId);
        const file = await claimStagedFile(tx, input.fileObjectId, actor);
        const document = await documentRepository.insert(tx, {
          id,
          projectId,
          lineageId: id,
          versionNumber: 1,
          fileObjectId: file.id,
          folder: input.folder,
          title: input.title,
          status: input.status,
          notes: input.notes || null,
          createdByUserId: actor.userId,
        });
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "document.created",
          entityType: "document",
          entityId: document.id,
          requestId: actor.requestId,
          metadata: {
            projectId,
            folder: input.folder,
            fileObjectId: file.id,
            sha256: file.sha256,
          },
        });
        return requireDocument(
          await documentRepository.findById(tx, { projectId, documentId: id }),
        );
      });
      return toContract(record);
    },

    /**
     * New version: retire the current row (compare-and-set on its version),
     * claim the new file, insert version N+1 in the same lineage. The old
     * version and its bytes are untouched.
     */
    async addVersion(
      projectId: string,
      documentId: string,
      input: AddDocumentVersionInput,
      actor: DocumentActor,
    ): Promise<Document> {
      const id = randomUUID();
      const record = await withTransaction(db, async (tx) => {
        const current = requireDocument(
          await documentRepository.findById(tx, { projectId, documentId }),
        );
        if (!current.document.isCurrent) {
          throw new ApiError(
            409,
            "NOT_CURRENT_VERSION",
            "New versions are added to the current version of a document.",
          );
        }
        requireFresh(
          await documentRepository.retireCurrent(tx, {
            id: current.document.id,
            expectedVersion: input.version,
          }),
        );
        const file = await claimStagedFile(tx, input.fileObjectId, actor);
        const next = await documentRepository.insert(tx, {
          id,
          projectId,
          lineageId: current.document.lineageId,
          versionNumber: current.document.versionNumber + 1,
          fileObjectId: file.id,
          folder: current.document.folder,
          title: current.document.title,
          status: input.status,
          notes: input.notes ?? current.document.notes,
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
        return requireDocument(
          await documentRepository.findById(tx, { projectId, documentId: id }),
        );
      });
      return toContract(record);
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
      const record = await withTransaction(db, async (tx) => {
        const existing = requireDocument(
          await documentRepository.findById(tx, { projectId, documentId }),
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
      });
      return toContract(record);
    },

    /** Soft-deletes the whole lineage. Bytes are retained (no byte deletion yet). */
    async delete(
      projectId: string,
      documentId: string,
      version: number,
      actor: DocumentActor,
    ): Promise<void> {
      await withTransaction(db, async (tx) => {
        const existing = requireDocument(
          await documentRepository.findById(tx, { projectId, documentId }),
        );
        assertCanManage(actor, existing);
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
