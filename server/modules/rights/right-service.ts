import {
  defaultRightsStatusForStage,
  isRightsStatusAllowedForStage,
  type AttachNewOwnerDocumentInput,
  type ChangeRightStatusInput,
  type CreateRightInput,
  type Document,
  type Right,
  type UpdateRightInput,
} from "@shared/contracts";
import type { ProjectRow } from "@shared/schema";
import type { Database } from "../../db/client";
import { withTransaction, type Transaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { appendAuditEvent } from "../audit/audit-repository";
import { documentRepository } from "../documents/document-repository";
import { createDocumentInTransaction } from "../documents/document-service";
import { projectRepository } from "../projects/project-repository";
import { toUserRef } from "../users/user-ref";
import {
  rightDocumentRepository,
  rightRepository,
  type RightEditableFields,
  type RightRecord,
} from "./right-repository";

export interface RightActor {
  userId: string;
  role: "studio_admin" | "user";
  requestId: string;
}

function toContract(record: RightRecord, documents: Document[]): Right {
  const { right, createdBy } = record;
  return {
    id: right.id,
    projectId: right.projectId,
    rightsType: right.rightsType,
    status: right.status,
    rightsHolder: right.rightsHolder,
    expiryDate: right.expiryDate,
    notes: right.notes,
    documents,
    createdBy: toUserRef(createdBy),
    version: right.version,
    createdAt: right.createdAt.toISOString(),
    updatedAt: right.updatedAt.toISOString(),
  };
}

function requireRight(record: RightRecord | undefined): RightRecord {
  if (!record)
    throw new ApiError(
      404,
      "RIGHT_NOT_FOUND",
      "The rights item was not found.",
    );
  return record;
}

function requireFresh<T>(row: T | undefined): T {
  if (!row)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "This rights item changed while you were editing. Refresh and try again.",
    );
  return row;
}

/** Destructive commands follow the authored-record rule; everything else is collaborative. */
function assertCanRemove(actor: RightActor, record: RightRecord): void {
  if (actor.role === "studio_admin") return;
  if (record.right.createdByUserId === actor.userId) return;
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Only the user who added this rights item or a studio administrator can remove it.",
  );
}

async function requireProject(
  executor: Transaction | Database,
  projectId: string,
): Promise<ProjectRow> {
  const project = await projectRepository.findById(executor, projectId);
  if (!project)
    throw new ApiError(404, "PROJECT_NOT_FOUND", "The project was not found.");
  return project;
}

/**
 * The one stage rule the product has: a rights status must come from the
 * vocabulary of the project's *current* stage. Earlier statuses remain
 * readable after a stage change until someone updates them.
 */
function assertStatusAllowed(
  project: ProjectRow,
  status: Right["status"],
): void {
  if (isRightsStatusAllowedForStage(project.stage, status)) return;
  throw new ApiError(
    422,
    "STATUS_NOT_ALLOWED_FOR_STAGE",
    `"${status}" is not a ${project.stage}-stage rights status.`,
  );
}

const blankToNull = (value: string | null | undefined) =>
  value === undefined ? undefined : value || null;

/**
 * Underlying rights: any active user records, edits, moves status and
 * attaches documents; removing an item or an attachment is the creator's or
 * an admin's. Nothing is created implicitly: an empty project has no rights
 * items until someone adds one.
 */
export function createRightService({ db }: { db: Database }) {
  const documentsByRight = (
    executor: Transaction | Database,
    projectId: string,
    rightIds: string[],
  ) =>
    rightDocumentRepository.loadDocumentsByOwner(executor, {
      projectId,
      ownerIds: rightIds,
    });

  async function load(
    executor: Transaction | Database,
    projectId: string,
    rightId: string,
  ): Promise<Right> {
    const record = requireRight(
      await rightRepository.findById(executor, { projectId, rightId }),
    );
    const documents = await documentsByRight(executor, projectId, [rightId]);
    return toContract(record, documents.get(rightId) ?? []);
  }

  async function attach(
    tx: Transaction,
    right: RightRecord["right"],
    documentLineageId: string,
    actor: RightActor,
  ) {
    await rightDocumentRepository.insert(tx, {
      ownerId: right.id,
      documentLineageId,
      attachedByUserId: actor.userId,
    });
    await appendAuditEvent(tx, {
      actorUserId: actor.userId,
      action: "right.document_attached",
      entityType: "project_right",
      entityId: right.id,
      requestId: actor.requestId,
      metadata: { projectId: right.projectId, documentLineageId },
    });
  }

  return {
    async list(projectId: string): Promise<Right[]> {
      await requireProject(db, projectId);
      const records = await rightRepository.listByProject(db, projectId);
      const documents = await documentsByRight(
        db,
        projectId,
        records.map((record) => record.right.id),
      );
      return records.map((record) =>
        toContract(record, documents.get(record.right.id) ?? []),
      );
    },

    async get(projectId: string, rightId: string): Promise<Right> {
      await requireProject(db, projectId);
      return load(db, projectId, rightId);
    },

    async create(
      projectId: string,
      input: CreateRightInput,
      actor: RightActor,
    ): Promise<Right> {
      const id = await withTransaction(db, async (tx) => {
        const project = await requireProject(tx, projectId);
        const status =
          input.status ?? defaultRightsStatusForStage(project.stage);
        assertStatusAllowed(project, status);
        const created = await rightRepository.insert(tx, {
          projectId,
          rightsType: input.rightsType,
          status,
          rightsHolder: input.rightsHolder || null,
          expiryDate: input.expiryDate ?? null,
          notes: input.notes || null,
          createdByUserId: actor.userId,
        });
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "right.created",
          entityType: "project_right",
          entityId: created.id,
          requestId: actor.requestId,
          metadata: { projectId, rightsType: input.rightsType, status },
        });
        return created.id;
      });
      return load(db, projectId, id);
    },

    async update(
      projectId: string,
      rightId: string,
      input: UpdateRightInput,
      actor: RightActor,
    ): Promise<Right> {
      const values: RightEditableFields = {
        rightsType: input.rightsType,
        rightsHolder: blankToNull(input.rightsHolder),
        expiryDate: input.expiryDate,
        notes: blankToNull(input.notes),
      };
      const changedFields = (
        Object.keys(values) as (keyof RightEditableFields)[]
      ).filter((key) => values[key] !== undefined);
      await withTransaction(db, async (tx) => {
        requireRight(
          await rightRepository.findById(tx, { projectId, rightId }),
        );
        requireFresh(
          await rightRepository.updateFields(tx, {
            id: rightId,
            expectedVersion: input.version,
            values,
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "right.updated",
          entityType: "project_right",
          entityId: rightId,
          requestId: actor.requestId,
          metadata: { projectId, changedFields },
        });
      });
      return load(db, projectId, rightId);
    },

    async changeStatus(
      projectId: string,
      rightId: string,
      input: ChangeRightStatusInput,
      actor: RightActor,
    ): Promise<Right> {
      await withTransaction(db, async (tx) => {
        const project = await requireProject(tx, projectId);
        const existing = requireRight(
          await rightRepository.findById(tx, { projectId, rightId }),
        );
        assertStatusAllowed(project, input.status);
        if (existing.right.status === input.status)
          throw new ApiError(
            409,
            "STATUS_UNCHANGED",
            "The rights item already has that status.",
          );
        requireFresh(
          await rightRepository.changeStatus(tx, {
            id: rightId,
            expectedVersion: input.version,
            status: input.status,
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "right.status_changed",
          entityType: "project_right",
          entityId: rightId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            stage: project.stage,
            from: existing.right.status,
            to: input.status,
          },
        });
      });
      return load(db, projectId, rightId);
    },

    /** Soft delete; attachments stay with the row, documents are untouched. */
    async delete(
      projectId: string,
      rightId: string,
      version: number,
      actor: RightActor,
    ): Promise<void> {
      await withTransaction(db, async (tx) => {
        const existing = requireRight(
          await rightRepository.findById(tx, { projectId, rightId }),
        );
        assertCanRemove(actor, existing);
        requireFresh(
          await rightRepository.softDelete(tx, {
            id: rightId,
            expectedVersion: version,
            deletedAt: new Date(),
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "right.deleted",
          entityType: "project_right",
          entityId: rightId,
          requestId: actor.requestId,
          metadata: { projectId, rightsType: existing.right.rightsType },
        });
      });
    },

    async attachNewDocument(
      projectId: string,
      rightId: string,
      input: AttachNewOwnerDocumentInput,
      actor: RightActor,
    ): Promise<Right> {
      await withTransaction(db, async (tx) => {
        const existing = requireRight(
          await rightRepository.findById(tx, { projectId, rightId }),
        );
        const document = await createDocumentInTransaction(tx, {
          projectId,
          document: { ...input, folder: "underlying-rights" },
          actor,
        });
        await attach(tx, existing.right, document.lineageId, actor);
      });
      return load(db, projectId, rightId);
    },

    async attachExistingDocument(
      projectId: string,
      rightId: string,
      documentId: string,
      actor: RightActor,
    ): Promise<Right> {
      await withTransaction(db, async (tx) => {
        const existing = requireRight(
          await rightRepository.findById(tx, { projectId, rightId }),
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
        const already = await rightDocumentRepository.find(tx, {
          ownerId: rightId,
          documentLineageId: document.document.lineageId,
        });
        if (already)
          throw new ApiError(
            409,
            "DOCUMENT_ALREADY_ATTACHED",
            "That document is already attached to this rights item.",
          );
        await attach(tx, existing.right, document.document.lineageId, actor);
      });
      return load(db, projectId, rightId);
    },

    async detachDocument(
      projectId: string,
      rightId: string,
      documentId: string,
      actor: RightActor,
    ): Promise<Right> {
      await withTransaction(db, async (tx) => {
        const existing = requireRight(
          await rightRepository.findById(tx, { projectId, rightId }),
        );
        assertCanRemove(actor, existing);
        const document = await documentRepository.findById(tx, {
          projectId,
          documentId,
        });
        const lineageId = document?.document.lineageId ?? documentId;
        const removed = await rightDocumentRepository.delete(tx, {
          ownerId: rightId,
          documentLineageId: lineageId,
        });
        if (!removed)
          throw new ApiError(
            404,
            "ATTACHMENT_NOT_FOUND",
            "That document is not attached to this rights item.",
          );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "right.document_detached",
          entityType: "project_right",
          entityId: rightId,
          requestId: actor.requestId,
          metadata: { projectId, documentLineageId: lineageId },
        });
      });
      return load(db, projectId, rightId);
    },
  };
}

export type RightService = ReturnType<typeof createRightService>;
