import type {
  AttachNewOwnerDocumentInput,
  ChangeDistributionTerritoryStatusInput,
  CreateDistributionTerritoryInput,
  CreateDistributionTerritoryNoteInput,
  DistributionTerritory,
  DistributionTerritoryNote,
  DistributionTerritorySummary,
  UpdateDistributionTerritoryInput,
  UpdateDistributionTerritoryNoteInput,
} from "@shared/contracts";
import type { Database } from "../../db/client";
import type { Transaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { withUniqueViolationAsConflict } from "../../db/unique-violation";
import { appendAuditEvent } from "../audit/audit-repository";
import { withLiveProjectTransaction } from "../projects/live-project";
import { documentRepository } from "../documents/document-repository";
import { createDocumentInTransaction } from "../documents/document-service";
import { projectRepository } from "../projects/project-repository";
import { toUserRef } from "../users/user-ref";
import {
  territoryDocumentRepository,
  territoryNoteRepository,
  territoryRepository,
  type TerritoryEditableFields,
  type TerritoryNoteRecord,
  type TerritoryRecord,
} from "./distribution-repository";

export interface DistributionActor {
  userId: string;
  role: "studio_admin" | "user";
  requestId: string;
}

/** Territory agreements are filed in the workspace's Distribution folder. */
const TERRITORY_FOLDER = "distribution" as const;

function requireTerritory(
  record: TerritoryRecord | undefined,
): TerritoryRecord {
  if (!record)
    throw new ApiError(
      404,
      "TERRITORY_NOT_FOUND",
      "The territory was not found.",
    );
  return record;
}

function requireNote(
  record: TerritoryNoteRecord | undefined,
): TerritoryNoteRecord {
  if (!record)
    throw new ApiError(
      404,
      "TERRITORY_NOTE_NOT_FOUND",
      "The note was not found.",
    );
  return record;
}

function requireFresh<T>(row: T | undefined): T {
  if (!row)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "The territory changed while you were editing. Refresh and try again.",
    );
  return row;
}

/** Removing a territory, or detaching its documents, follows the authored-record rule. */
function assertCanRemove(
  actor: DistributionActor,
  record: TerritoryRecord,
): void {
  if (actor.role === "studio_admin") return;
  if (record.territory.createdByUserId === actor.userId) return;
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Only the user who added this territory or a studio administrator can remove it.",
  );
}

/** Notes belong to their author. */
function assertCanManageNote(
  actor: DistributionActor,
  record: TerritoryNoteRecord,
): void {
  if (actor.role === "studio_admin") return;
  if (record.note.authorUserId === actor.userId) return;
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Only the author or a studio administrator can change this note.",
  );
}

const blankToNull = (value: string | undefined) =>
  value === undefined ? undefined : value || null;

function toSummary(
  record: TerritoryRecord,
  counts: { notes: number; documents: number },
): DistributionTerritorySummary {
  const { territory, createdBy } = record;
  return {
    id: territory.id,
    projectId: territory.projectId,
    name: territory.name,
    status: territory.status,
    noteCount: counts.notes,
    documentCount: counts.documents,
    createdBy: toUserRef(createdBy),
    version: territory.version,
    createdAt: territory.createdAt.toISOString(),
    updatedAt: territory.updatedAt.toISOString(),
  };
}

function toNote(record: TerritoryNoteRecord): DistributionTerritoryNote {
  const { note, author } = record;
  return {
    id: note.id,
    territoryId: note.territoryId,
    author: toUserRef(author),
    body: note.body,
    editedAt: note.editedAt?.toISOString() ?? null,
    version: note.version,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

/**
 * Distribution use-cases. A territory is a project-scoped market workspace
 * with a status and descriptive deal fields. Any active user creates
 * territories, renames them, edits deal information, changes status,
 * writes notes and attaches documents; removing a territory or detaching a
 * document is creator-or-admin; a note is author-or-admin. Nothing here is
 * money: the product records deal terms as text and never calculates.
 */
export function createDistributionService({ db }: { db: Database }) {
  async function requireProject(
    executor: Transaction | Database,
    projectId: string,
  ) {
    if (!(await projectRepository.findById(executor, projectId)))
      throw new ApiError(
        404,
        "PROJECT_NOT_FOUND",
        "The project was not found.",
      );
  }

  async function load(
    executor: Transaction | Database,
    projectId: string,
    territoryId: string,
  ): Promise<DistributionTerritory> {
    const record = requireTerritory(
      await territoryRepository.findById(executor, { projectId, territoryId }),
    );
    const [notes, documents] = await Promise.all([
      territoryNoteRepository.listByTerritory(executor, territoryId),
      territoryDocumentRepository.loadDocumentsByOwner(executor, {
        projectId,
        ownerIds: [territoryId],
      }),
    ]);
    const attached = documents.get(territoryId) ?? [];
    const { territory } = record;
    return {
      ...toSummary(record, { notes: notes.length, documents: attached.length }),
      deal: {
        distributor: territory.distributor,
        contact: territory.contact,
        signaturePayment: territory.signaturePayment,
        deliveryPayment: territory.deliveryPayment,
        generalNotes: territory.generalNotes,
      },
      notes: notes.map(toNote),
      documents: attached,
    };
  }

  /** A territory name is unique within its project, ignoring case (also a partial unique index). */
  async function assertNameFree(
    tx: Transaction,
    projectId: string,
    name: string,
    exceptId?: string,
  ) {
    const existing = await territoryRepository.findByName(tx, {
      projectId,
      name,
    });
    if (existing && existing.id !== exceptId) throw nameTaken();
  }

  const nameTaken = () =>
    new ApiError(
      409,
      "TERRITORY_NAME_TAKEN",
      "This project already has a territory with that name.",
    );
  /** Creation and rename both race on the case-insensitive unique index. */
  const guardingName = <T>(work: () => Promise<T>) =>
    withUniqueViolationAsConflict(
      "distribution_territories_project_name_unique",
      nameTaken,
      work,
    );

  async function attach(
    tx: Transaction,
    input: {
      projectId: string;
      territoryId: string;
      documentLineageId: string;
    },
    actor: DistributionActor,
  ) {
    await territoryDocumentRepository.insert(tx, {
      ownerId: input.territoryId,
      documentLineageId: input.documentLineageId,
      attachedByUserId: actor.userId,
    });
    await territoryRepository.touch(tx, input.territoryId);
    await appendAuditEvent(tx, {
      actorUserId: actor.userId,
      action: "distribution_territory.document_attached",
      entityType: "distribution_territory",
      entityId: input.territoryId,
      requestId: actor.requestId,
      metadata: {
        projectId: input.projectId,
        documentLineageId: input.documentLineageId,
      },
    });
  }

  return {
    async list(projectId: string): Promise<DistributionTerritorySummary[]> {
      await requireProject(db, projectId);
      const [records, counts] = await Promise.all([
        territoryRepository.listByProject(db, projectId),
        territoryRepository.countsByProject(db, projectId),
      ]);
      return records.map((r) =>
        toSummary(r, counts.get(r.territory.id) ?? { notes: 0, documents: 0 }),
      );
    },

    async get(
      projectId: string,
      territoryId: string,
    ): Promise<DistributionTerritory> {
      await requireProject(db, projectId);
      return load(db, projectId, territoryId);
    },

    async create(
      projectId: string,
      input: CreateDistributionTerritoryInput,
      actor: DistributionActor,
    ): Promise<DistributionTerritory> {
      const id = await guardingName(() =>
        withLiveProjectTransaction(db, projectId, async (tx) => {
          await assertNameFree(tx, projectId, input.name);
          const created = await territoryRepository.insert(tx, {
            projectId,
            name: input.name,
            createdByUserId: actor.userId,
          });
          await appendAuditEvent(tx, {
            actorUserId: actor.userId,
            action: "distribution_territory.created",
            entityType: "distribution_territory",
            entityId: created.id,
            requestId: actor.requestId,
            metadata: { projectId, name: input.name },
          });
          return created.id;
        }),
      );
      return load(db, projectId, id);
    },

    /** Rename and deal fields; collaborative, compare-and-set. */
    async update(
      projectId: string,
      territoryId: string,
      input: UpdateDistributionTerritoryInput,
      actor: DistributionActor,
    ): Promise<DistributionTerritory> {
      const values: TerritoryEditableFields = {
        name: input.name,
        distributor: blankToNull(input.distributor),
        contact: blankToNull(input.contact),
        signaturePayment: blankToNull(input.signaturePayment),
        deliveryPayment: blankToNull(input.deliveryPayment),
        generalNotes: blankToNull(input.generalNotes),
      };
      const changedFields = (
        Object.keys(values) as (keyof TerritoryEditableFields)[]
      ).filter((k) => values[k] !== undefined);
      await guardingName(() =>
        withLiveProjectTransaction(db, projectId, async (tx) => {
          const existing = requireTerritory(
            await territoryRepository.findById(tx, { projectId, territoryId }),
          );
          if (input.name !== undefined)
            await assertNameFree(tx, projectId, input.name, territoryId);
          requireFresh(
            await territoryRepository.updateFields(tx, {
              id: territoryId,
              expectedVersion: input.version,
              values,
            }),
          );
          await appendAuditEvent(tx, {
            actorUserId: actor.userId,
            action: "distribution_territory.updated",
            entityType: "distribution_territory",
            entityId: territoryId,
            requestId: actor.requestId,
            metadata: {
              projectId,
              changedFields,
              ...(input.name !== undefined &&
              input.name !== existing.territory.name
                ? { fromName: existing.territory.name, toName: input.name }
                : {}),
            },
          });
        }),
      );
      return load(db, projectId, territoryId);
    },

    async changeStatus(
      projectId: string,
      territoryId: string,
      input: ChangeDistributionTerritoryStatusInput,
      actor: DistributionActor,
    ): Promise<DistributionTerritory> {
      await withLiveProjectTransaction(db, projectId, async (tx) => {
        const existing = requireTerritory(
          await territoryRepository.findById(tx, { projectId, territoryId }),
        );
        if (existing.territory.status === input.status)
          throw new ApiError(
            409,
            "STATUS_UNCHANGED",
            "The territory already has that status.",
          );
        requireFresh(
          await territoryRepository.changeStatus(tx, {
            id: territoryId,
            expectedVersion: input.version,
            status: input.status,
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "distribution_territory.status_changed",
          entityType: "distribution_territory",
          entityId: territoryId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            from: existing.territory.status,
            to: input.status,
          },
        });
      });
      return load(db, projectId, territoryId);
    },

    /** Soft delete; notes and attachments stay with the row, documents are untouched. */
    async delete(
      projectId: string,
      territoryId: string,
      version: number,
      actor: DistributionActor,
    ): Promise<void> {
      await withLiveProjectTransaction(db, projectId, async (tx) => {
        const existing = requireTerritory(
          await territoryRepository.findById(tx, { projectId, territoryId }),
        );
        assertCanRemove(actor, existing);
        requireFresh(
          await territoryRepository.softDelete(tx, {
            id: territoryId,
            expectedVersion: version,
            deletedAt: new Date(),
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "distribution_territory.deleted",
          entityType: "distribution_territory",
          entityId: territoryId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            name: existing.territory.name,
            status: existing.territory.status,
          },
        });
      });
    },

    async createNote(
      projectId: string,
      territoryId: string,
      input: CreateDistributionTerritoryNoteInput,
      actor: DistributionActor,
    ): Promise<DistributionTerritory> {
      await withLiveProjectTransaction(db, projectId, async (tx) => {
        requireTerritory(
          await territoryRepository.findById(tx, { projectId, territoryId }),
        );
        const created = await territoryNoteRepository.insert(tx, {
          territoryId,
          authorUserId: actor.userId,
          body: input.body,
        });
        await territoryRepository.touch(tx, territoryId);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "distribution_territory_note.created",
          entityType: "distribution_territory_note",
          entityId: created.id,
          requestId: actor.requestId,
          metadata: { projectId, territoryId },
        });
      });
      return load(db, projectId, territoryId);
    },

    async updateNote(
      projectId: string,
      territoryId: string,
      noteId: string,
      input: UpdateDistributionTerritoryNoteInput,
      actor: DistributionActor,
    ): Promise<DistributionTerritory> {
      await withLiveProjectTransaction(db, projectId, async (tx) => {
        requireTerritory(
          await territoryRepository.findById(tx, { projectId, territoryId }),
        );
        const existing = requireNote(
          await territoryNoteRepository.findById(tx, { territoryId, noteId }),
        );
        assertCanManageNote(actor, existing);
        requireFresh(
          await territoryNoteRepository.updateBody(tx, {
            id: noteId,
            expectedVersion: input.version,
            body: input.body,
            editedAt: new Date(),
          }),
        );
        await territoryRepository.touch(tx, territoryId);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "distribution_territory_note.updated",
          entityType: "distribution_territory_note",
          entityId: noteId,
          requestId: actor.requestId,
          metadata: { projectId, territoryId },
        });
      });
      return load(db, projectId, territoryId);
    },

    async deleteNote(
      projectId: string,
      territoryId: string,
      noteId: string,
      version: number,
      actor: DistributionActor,
    ): Promise<DistributionTerritory> {
      await withLiveProjectTransaction(db, projectId, async (tx) => {
        requireTerritory(
          await territoryRepository.findById(tx, { projectId, territoryId }),
        );
        const existing = requireNote(
          await territoryNoteRepository.findById(tx, { territoryId, noteId }),
        );
        assertCanManageNote(actor, existing);
        requireFresh(
          await territoryNoteRepository.softDelete(tx, {
            id: noteId,
            expectedVersion: version,
            deletedAt: new Date(),
          }),
        );
        await territoryRepository.touch(tx, territoryId);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "distribution_territory_note.deleted",
          entityType: "distribution_territory_note",
          entityId: noteId,
          requestId: actor.requestId,
          metadata: { projectId, territoryId },
        });
      });
      return load(db, projectId, territoryId);
    },

    /** Upload-and-attach in one unit of work; the Documents domain creates the document. */
    async attachNewDocument(
      projectId: string,
      territoryId: string,
      input: AttachNewOwnerDocumentInput,
      actor: DistributionActor,
    ): Promise<DistributionTerritory> {
      await withLiveProjectTransaction(db, projectId, async (tx) => {
        requireTerritory(
          await territoryRepository.findById(tx, { projectId, territoryId }),
        );
        const document = await createDocumentInTransaction(tx, {
          projectId,
          document: { ...input, folder: TERRITORY_FOLDER },
          actor,
        });
        await attach(
          tx,
          { projectId, territoryId, documentLineageId: document.lineageId },
          actor,
        );
      });
      return load(db, projectId, territoryId);
    },

    async attachExistingDocument(
      projectId: string,
      territoryId: string,
      documentId: string,
      actor: DistributionActor,
    ): Promise<DistributionTerritory> {
      await withLiveProjectTransaction(db, projectId, async (tx) => {
        requireTerritory(
          await territoryRepository.findById(tx, { projectId, territoryId }),
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
        const already = await territoryDocumentRepository.find(tx, {
          ownerId: territoryId,
          documentLineageId: document.document.lineageId,
        });
        if (already)
          throw new ApiError(
            409,
            "DOCUMENT_ALREADY_ATTACHED",
            "That document is already attached.",
          );
        await attach(
          tx,
          {
            projectId,
            territoryId,
            documentLineageId: document.document.lineageId,
          },
          actor,
        );
      });
      return load(db, projectId, territoryId);
    },

    async detachDocument(
      projectId: string,
      territoryId: string,
      documentId: string,
      actor: DistributionActor,
    ): Promise<DistributionTerritory> {
      await withLiveProjectTransaction(db, projectId, async (tx) => {
        const existing = requireTerritory(
          await territoryRepository.findById(tx, { projectId, territoryId }),
        );
        assertCanRemove(actor, existing);
        const document = await documentRepository.findById(tx, {
          projectId,
          documentId,
        });
        const lineageId = document?.document.lineageId ?? documentId;
        const removed = await territoryDocumentRepository.delete(tx, {
          ownerId: territoryId,
          documentLineageId: lineageId,
        });
        if (!removed)
          throw new ApiError(
            404,
            "ATTACHMENT_NOT_FOUND",
            "That document is not attached here.",
          );
        await territoryRepository.touch(tx, territoryId);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "distribution_territory.document_detached",
          entityType: "distribution_territory",
          entityId: territoryId,
          requestId: actor.requestId,
          metadata: { projectId, documentLineageId: lineageId },
        });
      });
      return load(db, projectId, territoryId);
    },
  };
}

export type DistributionService = ReturnType<typeof createDistributionService>;
