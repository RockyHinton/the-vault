import type { CreateNoteInput, Note, UpdateNoteInput } from "@shared/contracts";
import type { Database } from "../../db/client";
import type { Transaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { appendAuditEvent } from "../audit/audit-repository";
import { withLiveProjectTransaction } from "../projects/live-project";
import { projectRepository } from "../projects/project-repository";
import { toUserRef } from "../users/user-ref";
import {
  noteRepository,
  type NoteEditableFields,
  type NoteRecord,
} from "./note-repository";

export interface NoteActor {
  userId: string;
  role: "studio_admin" | "user";
  requestId: string;
}

function toContract(record: NoteRecord): Note {
  const { note, author } = record;
  return {
    id: note.id,
    projectId: note.projectId,
    author: toUserRef(author),
    body: note.body,
    category: note.category,
    version: note.version,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

function requireNote(record: NoteRecord | undefined): NoteRecord {
  if (!record)
    throw new ApiError(404, "NOTE_NOT_FOUND", "The note was not found.");
  return record;
}

function requireFresh<T>(row: T | undefined): T {
  if (!row)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "This note changed while you were editing. Refresh and try again.",
    );
  return row;
}

/** Authored-record rule: the author manages their own note; admins manage all. */
function assertCanManage(actor: NoteActor, record: NoteRecord): void {
  if (actor.role === "studio_admin") return;
  if (record.note.authorUserId === actor.userId) return;
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Only the author or a studio administrator can change this note.",
  );
}

async function requireProject(tx: Transaction | Database, projectId: string) {
  const project = await projectRepository.findById(tx, projectId);
  if (!project)
    throw new ApiError(404, "PROJECT_NOT_FOUND", "The project was not found.");
}

/** Project notes: any active user posts; author-or-admin edits and deletes. */
export function createNoteService({ db }: { db: Database }) {
  return {
    async list(projectId: string): Promise<Note[]> {
      await requireProject(db, projectId);
      return (await noteRepository.listByProject(db, projectId)).map(
        toContract,
      );
    },

    async create(
      projectId: string,
      input: CreateNoteInput,
      actor: NoteActor,
    ): Promise<Note> {
      const id = await withLiveProjectTransaction(db, projectId, async (tx) => {
        const created = await noteRepository.insert(tx, {
          projectId,
          authorUserId: actor.userId,
          body: input.body,
          category: input.category,
        });
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "note.created",
          entityType: "project_note",
          entityId: created.id,
          requestId: actor.requestId,
          metadata: { projectId, category: input.category },
        });
        return created.id;
      });
      return toContract(
        requireNote(
          await noteRepository.findById(db, { projectId, noteId: id }),
        ),
      );
    },

    async update(
      projectId: string,
      noteId: string,
      input: UpdateNoteInput,
      actor: NoteActor,
    ): Promise<Note> {
      const values: NoteEditableFields = {
        body: input.body,
        category: input.category,
      };
      const changedFields = (
        Object.keys(values) as (keyof NoteEditableFields)[]
      ).filter((key) => values[key] !== undefined);
      await withLiveProjectTransaction(db, projectId, async (tx) => {
        const existing = requireNote(
          await noteRepository.findById(tx, { projectId, noteId }),
        );
        assertCanManage(actor, existing);
        requireFresh(
          await noteRepository.updateFields(tx, {
            id: noteId,
            expectedVersion: input.version,
            values,
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "note.updated",
          entityType: "project_note",
          entityId: noteId,
          requestId: actor.requestId,
          metadata: { projectId, changedFields },
        });
      });
      return toContract(
        requireNote(await noteRepository.findById(db, { projectId, noteId })),
      );
    },

    async delete(
      projectId: string,
      noteId: string,
      version: number,
      actor: NoteActor,
    ): Promise<void> {
      await withLiveProjectTransaction(db, projectId, async (tx) => {
        const existing = requireNote(
          await noteRepository.findById(tx, { projectId, noteId }),
        );
        assertCanManage(actor, existing);
        requireFresh(
          await noteRepository.softDelete(tx, {
            id: noteId,
            expectedVersion: version,
            deletedAt: new Date(),
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "note.deleted",
          entityType: "project_note",
          entityId: noteId,
          requestId: actor.requestId,
          metadata: { projectId, authorUserId: existing.note.authorUserId },
        });
      });
    },
  };
}

export type NoteService = ReturnType<typeof createNoteService>;
