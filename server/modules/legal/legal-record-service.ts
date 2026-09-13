import {
  legalDetailsSchema,
  type AttachNewOwnerDocumentInput,
  type CreateLegalRecordInput,
  type Document,
  type DocumentFolder,
  type LegalCategory,
  type LegalRecord,
  type UpdateLegalRecordInput,
} from "@shared/contracts";
import type { Database } from "../../db/client";
import { withTransaction, type Transaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { appendAuditEvent } from "../audit/audit-repository";
import { documentRepository } from "../documents/document-repository";
import { createDocumentInTransaction } from "../documents/document-service";
import { projectRepository } from "../projects/project-repository";
import { toUserRef } from "../users/user-ref";
import {
  legalRecordDocumentRepository,
  legalRecordRepository,
  type LegalRecordEditableFields,
  type LegalRecordRecord,
} from "./legal-record-repository";

export interface LegalActor {
  userId: string;
  role: "studio_admin" | "user";
  requestId: string;
}

/** Each legal category files its documents in the matching workspace folder. */
const folderForCategory: Record<LegalCategory, DocumentFolder> = {
  chain_of_title: "legal/chain-of-title",
  writer_agreements: "legal/writer-agreements",
  investment_agreements: "legal/investment-agreements",
  co_production: "legal/co-production",
  producers_agreements: "legal/producers-agreements",
  director_agreements: "legal/director-agreements",
  cast_agreements: "legal/cast-agreements",
  banking_docs: "legal/banking-docs",
  funding_tax_credit: "legal/funding-tax-credit",
  sales_agency: "legal/sales-agency",
  cama: "legal/cama",
};

function toContract(
  record: LegalRecordRecord,
  documents: Document[],
): LegalRecord {
  const { record: row, createdBy } = record;
  return {
    id: row.id,
    projectId: row.projectId,
    category: row.category,
    name: row.name,
    notes: row.notes,
    // Stored JSON was validated on the way in; parsing again keeps the contract honest.
    details: legalDetailsSchema.parse(row.details),
    documents,
    createdBy: toUserRef(createdBy),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function requireRecord(
  record: LegalRecordRecord | undefined,
): LegalRecordRecord {
  if (!record)
    throw new ApiError(
      404,
      "LEGAL_RECORD_NOT_FOUND",
      "The legal record was not found.",
    );
  return record;
}

function requireFresh<T>(row: T | undefined): T {
  if (!row)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "This record changed while you were editing. Refresh and try again.",
    );
  return row;
}

/** Destructive commands follow the authored-record rule; everything else is collaborative. */
function assertCanRemove(actor: LegalActor, record: LegalRecordRecord): void {
  if (actor.role === "studio_admin") return;
  if (record.record.createdByUserId === actor.userId) return;
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Only the user who added this record or a studio administrator can remove it.",
  );
}

/** Details always describe the record's own category; the DB CHECK backs this up. */
function assertDetailsMatchCategory(
  category: LegalCategory,
  details: { category: LegalCategory } | undefined,
): void {
  if (details && details.category !== category) {
    throw new ApiError(
      422,
      "DETAILS_CATEGORY_MISMATCH",
      `Details for "${details.category}" cannot be stored on a "${category}" record.`,
    );
  }
}

async function requireProject(
  executor: Transaction | Database,
  projectId: string,
) {
  const project = await projectRepository.findById(executor, projectId);
  if (!project)
    throw new ApiError(404, "PROJECT_NOT_FOUND", "The project was not found.");
}

const blankToNull = (value: string | null | undefined) =>
  value === undefined ? undefined : value || null;

/**
 * Legal / documentation records: one aggregate for the eleven categories.
 * A record carries no stored status; its confirmation and the category
 * overview are derived from attached document statuses (shared contracts,
 * `legal-completion.ts`). Any active user records, edits, attaches and moves
 * document statuses; removal and detachment are the creator's or an admin's.
 */
export function createLegalRecordService({ db }: { db: Database }) {
  const documentsByRecord = (
    executor: Transaction | Database,
    projectId: string,
    recordIds: string[],
  ) =>
    legalRecordDocumentRepository.loadDocumentsByOwner(executor, {
      projectId,
      ownerIds: recordIds,
    });

  async function load(
    executor: Transaction | Database,
    projectId: string,
    recordId: string,
  ): Promise<LegalRecord> {
    const record = requireRecord(
      await legalRecordRepository.findById(executor, { projectId, recordId }),
    );
    const documents = await documentsByRecord(executor, projectId, [recordId]);
    return toContract(record, documents.get(recordId) ?? []);
  }

  /** The attached lineage a document id belongs to, or 404 if it is not attached. */
  async function requireAttachedLineage(
    tx: Transaction,
    projectId: string,
    recordId: string,
    documentId: string,
  ): Promise<string> {
    const document = await documentRepository.findById(tx, {
      projectId,
      documentId,
    });
    const lineageId = document?.document.lineageId ?? documentId;
    const link = await legalRecordDocumentRepository.find(tx, {
      ownerId: recordId,
      documentLineageId: lineageId,
    });
    if (!link)
      throw new ApiError(
        404,
        "ATTACHMENT_NOT_FOUND",
        "That document is not attached to this record.",
      );
    return lineageId;
  }

  async function attach(
    tx: Transaction,
    record: LegalRecordRecord["record"],
    documentLineageId: string,
    actor: LegalActor,
  ) {
    await legalRecordDocumentRepository.insert(tx, {
      ownerId: record.id,
      documentLineageId,
      attachedByUserId: actor.userId,
    });
    await appendAuditEvent(tx, {
      actorUserId: actor.userId,
      action: "legal_record.document_attached",
      entityType: "legal_record",
      entityId: record.id,
      requestId: actor.requestId,
      metadata: {
        projectId: record.projectId,
        category: record.category,
        documentLineageId,
      },
    });
  }

  return {
    async list(
      projectId: string,
      input: { category?: LegalCategory },
    ): Promise<LegalRecord[]> {
      await requireProject(db, projectId);
      const records = await legalRecordRepository.listByProject(db, {
        projectId,
        category: input.category,
      });
      const documents = await documentsByRecord(
        db,
        projectId,
        records.map((record) => record.record.id),
      );
      return records.map((record) =>
        toContract(record, documents.get(record.record.id) ?? []),
      );
    },

    async get(projectId: string, recordId: string): Promise<LegalRecord> {
      await requireProject(db, projectId);
      return load(db, projectId, recordId);
    },

    async create(
      projectId: string,
      input: CreateLegalRecordInput,
      actor: LegalActor,
    ): Promise<LegalRecord> {
      const id = await withTransaction(db, async (tx) => {
        await requireProject(tx, projectId);
        const created = await legalRecordRepository.insert(tx, {
          projectId,
          category: input.details.category,
          name: input.name,
          notes: input.notes || null,
          details: input.details,
          createdByUserId: actor.userId,
        });
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "legal_record.created",
          entityType: "legal_record",
          entityId: created.id,
          requestId: actor.requestId,
          metadata: { projectId, category: created.category },
        });
        return created.id;
      });
      return load(db, projectId, id);
    },

    async update(
      projectId: string,
      recordId: string,
      input: UpdateLegalRecordInput,
      actor: LegalActor,
    ): Promise<LegalRecord> {
      const values: LegalRecordEditableFields = {
        name: input.name,
        notes: blankToNull(input.notes),
        details: input.details,
      };
      const changedFields = (
        Object.keys(values) as (keyof LegalRecordEditableFields)[]
      ).filter((key) => values[key] !== undefined);
      await withTransaction(db, async (tx) => {
        const existing = requireRecord(
          await legalRecordRepository.findById(tx, { projectId, recordId }),
        );
        assertDetailsMatchCategory(existing.record.category, input.details);
        requireFresh(
          await legalRecordRepository.updateFields(tx, {
            id: recordId,
            expectedVersion: input.version,
            values,
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "legal_record.updated",
          entityType: "legal_record",
          entityId: recordId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            category: existing.record.category,
            changedFields,
          },
        });
      });
      return load(db, projectId, recordId);
    },

    /** Soft delete; attachments stay with the row, documents are untouched. */
    async delete(
      projectId: string,
      recordId: string,
      version: number,
      actor: LegalActor,
    ): Promise<void> {
      await withTransaction(db, async (tx) => {
        const existing = requireRecord(
          await legalRecordRepository.findById(tx, { projectId, recordId }),
        );
        assertCanRemove(actor, existing);
        requireFresh(
          await legalRecordRepository.softDelete(tx, {
            id: recordId,
            expectedVersion: version,
            deletedAt: new Date(),
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "legal_record.deleted",
          entityType: "legal_record",
          entityId: recordId,
          requestId: actor.requestId,
          metadata: { projectId, category: existing.record.category },
        });
      });
    },

    async attachNewDocument(
      projectId: string,
      recordId: string,
      input: AttachNewOwnerDocumentInput,
      actor: LegalActor,
    ): Promise<LegalRecord> {
      await withTransaction(db, async (tx) => {
        const existing = requireRecord(
          await legalRecordRepository.findById(tx, { projectId, recordId }),
        );
        const document = await createDocumentInTransaction(tx, {
          projectId,
          document: {
            ...input,
            folder: folderForCategory[existing.record.category],
          },
          actor,
        });
        await attach(tx, existing.record, document.lineageId, actor);
      });
      return load(db, projectId, recordId);
    },

    async attachExistingDocument(
      projectId: string,
      recordId: string,
      documentId: string,
      actor: LegalActor,
    ): Promise<LegalRecord> {
      await withTransaction(db, async (tx) => {
        const existing = requireRecord(
          await legalRecordRepository.findById(tx, { projectId, recordId }),
        );
        const document = await documentRepository.findById(tx, {
          projectId,
          documentId,
        });
        if (!document)
          throw new ApiError(
            404,
            "DOCUMENT_NOT_FOUND",
            "The document was not found.",
          );
        const already = await legalRecordDocumentRepository.find(tx, {
          ownerId: recordId,
          documentLineageId: document.document.lineageId,
        });
        if (already)
          throw new ApiError(
            409,
            "DOCUMENT_ALREADY_ATTACHED",
            "That document is already attached to this record.",
          );
        await attach(tx, existing.record, document.document.lineageId, actor);
      });
      return load(db, projectId, recordId);
    },

    async detachDocument(
      projectId: string,
      recordId: string,
      documentId: string,
      actor: LegalActor,
    ): Promise<LegalRecord> {
      await withTransaction(db, async (tx) => {
        const existing = requireRecord(
          await legalRecordRepository.findById(tx, { projectId, recordId }),
        );
        assertCanRemove(actor, existing);
        const lineageId = await requireAttachedLineage(
          tx,
          projectId,
          recordId,
          documentId,
        );
        await legalRecordDocumentRepository.delete(tx, {
          ownerId: recordId,
          documentLineageId: lineageId,
        });
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "legal_record.document_detached",
          entityType: "legal_record",
          entityId: recordId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            category: existing.record.category,
            documentLineageId: lineageId,
          },
        });
      });
      return load(db, projectId, recordId);
    },
  };
}

export type LegalRecordService = ReturnType<typeof createLegalRecordService>;
