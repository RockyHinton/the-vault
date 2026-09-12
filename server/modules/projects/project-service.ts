import type {
  ArchiveReason,
  CreateProjectInput,
  Project,
  ProjectStage,
  UpdateProjectInput,
} from "@shared/contracts";
import type { ProjectRow } from "@shared/schema";
import type { Database } from "../../db/client";
import { withTransaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { appendAuditEvent } from "../audit/audit-repository";
import { canTransitionProjectStage } from "./project-lifecycle";
import {
  projectRepository,
  type ProjectEditableFields,
} from "./project-repository";

/** Who is acting and under which request; every command needs both. */
export interface Actor {
  userId: string;
  requestId: string;
}

function toContract(row: ProjectRow): Project {
  const archive =
    row.archivedAt &&
    row.archiveReason &&
    row.archiveRevisit &&
    row.archiveStarred !== null &&
    row.archivedFromStage
      ? {
          reason: row.archiveReason,
          revisit: row.archiveRevisit,
          starred: row.archiveStarred,
          notes: row.archiveNotes,
          archivedFromStage: row.archivedFromStage,
        }
      : null;
  return {
    id: row.id,
    title: row.title,
    logline: row.logline,
    synopsis: row.synopsis,
    genre: row.genre,
    stage: row.stage,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    archive,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function requireProject(row: ProjectRow | undefined): ProjectRow {
  if (!row)
    throw new ApiError(404, "PROJECT_NOT_FOUND", "The project was not found.");
  return row;
}

/** A compare-and-set update matched no row: the caller's version is stale. */
function requireFresh(row: ProjectRow | undefined): ProjectRow {
  if (!row)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "This project changed while you were editing it. Refresh and try again.",
    );
  return row;
}

function requireNotArchived(row: ProjectRow, message: string): void {
  if (row.archivedAt) throw new ApiError(409, "PROJECT_ARCHIVED", message);
}

/** Empty strings from forms are stored as NULL. */
const blankToNull = (value: string | null | undefined) =>
  value === undefined ? undefined : value || null;

/**
 * Projects use-cases. Each command is one transaction: read the current row,
 * apply policy, compare-and-set the change, append stage history and the
 * audit event. A stale version throws inside the transaction, so nothing is
 * written. This is the reference shape for every future domain service.
 */
export function createProjectService({ db }: { db: Database }) {
  return {
    async list(input: {
      archived: "true" | "false" | "all";
      limit: number;
      cursor?: string;
    }) {
      // Fetch one extra row so `nextCursor` is only set when more rows exist.
      const rows = await projectRepository.list(db, {
        ...input,
        limit: input.limit + 1,
      });
      const items = rows.slice(0, input.limit);
      return {
        items: items.map(toContract),
        nextCursor:
          rows.length > input.limit ? (items.at(-1)?.id ?? null) : null,
      };
    },

    async get(id: string): Promise<Project> {
      return toContract(
        requireProject(await projectRepository.findById(db, id)),
      );
    },

    async create(input: CreateProjectInput, actor: Actor): Promise<Project> {
      const row = await withTransaction(db, async (tx) => {
        const created = await projectRepository.insert(tx, {
          title: input.title,
          logline: input.logline || null,
          synopsis: input.synopsis || null,
          genre: input.genre || null,
          createdByUserId: actor.userId,
        });
        await projectRepository.appendStageHistory(tx, {
          projectId: created.id,
          fromStage: null,
          toStage: created.stage,
          transitionType: "created",
          actorUserId: actor.userId,
          requestId: actor.requestId,
        });
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "project.created",
          entityType: "project",
          entityId: created.id,
          requestId: actor.requestId,
          metadata: { stage: created.stage },
        });
        return created;
      });
      return toContract(row);
    },

    async update(
      id: string,
      input: UpdateProjectInput,
      actor: Actor,
    ): Promise<Project> {
      const { version, ...changes } = input;
      const values: ProjectEditableFields = {
        title: changes.title,
        logline: blankToNull(changes.logline),
        synopsis: blankToNull(changes.synopsis),
        genre: blankToNull(changes.genre),
      };
      const changedFields = (
        Object.keys(values) as (keyof ProjectEditableFields)[]
      ).filter((key) => values[key] !== undefined);

      const row = await withTransaction(db, async (tx) => {
        const existing = requireProject(
          await projectRepository.findById(tx, id),
        );
        requireNotArchived(existing, "Restore the project before editing it.");
        const updated = requireFresh(
          await projectRepository.updateFields(tx, {
            id,
            expectedVersion: version,
            values,
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "project.updated",
          entityType: "project",
          entityId: updated.id,
          requestId: actor.requestId,
          metadata: { changedFields },
        });
        return updated;
      });
      return toContract(row);
    },

    async transition(
      id: string,
      input: { toStage: ProjectStage; version: number; note?: string },
      actor: Actor,
    ): Promise<Project> {
      const row = await withTransaction(db, async (tx) => {
        const existing = requireProject(
          await projectRepository.findById(tx, id),
        );
        requireNotArchived(
          existing,
          "Restore the project before changing its stage.",
        );
        if (!canTransitionProjectStage(existing.stage, input.toStage)) {
          throw new ApiError(
            422,
            "INVALID_STAGE_TRANSITION",
            "That project stage transition is not permitted.",
          );
        }
        const updated = requireFresh(
          await projectRepository.changeStage(tx, {
            id,
            expectedVersion: input.version,
            toStage: input.toStage,
          }),
        );
        await projectRepository.appendStageHistory(tx, {
          projectId: updated.id,
          fromStage: existing.stage,
          toStage: input.toStage,
          transitionType: "stage_changed",
          note: input.note,
          actorUserId: actor.userId,
          requestId: actor.requestId,
        });
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "project.stage_changed",
          entityType: "project",
          entityId: updated.id,
          requestId: actor.requestId,
          metadata: { fromStage: existing.stage, toStage: input.toStage },
        });
        return updated;
      });
      return toContract(row);
    },

    async archive(
      id: string,
      input: {
        reason: ArchiveReason;
        revisit: "yes" | "maybe" | "no";
        starred: boolean;
        notes?: string;
        version: number;
      },
      actor: Actor,
    ): Promise<Project> {
      const row = await withTransaction(db, async (tx) => {
        const existing = requireProject(
          await projectRepository.findById(tx, id),
        );
        if (existing.archivedAt) {
          throw new ApiError(
            409,
            "PROJECT_ALREADY_ARCHIVED",
            "This project is already archived.",
          );
        }
        const updated = requireFresh(
          await projectRepository.archive(tx, {
            id,
            expectedVersion: input.version,
            archive: {
              reason: input.reason,
              revisit: input.revisit,
              starred: input.starred,
              notes: input.notes ?? null,
              archivedFromStage: existing.stage,
            },
          }),
        );
        await projectRepository.appendStageHistory(tx, {
          projectId: updated.id,
          fromStage: existing.stage,
          toStage: existing.stage,
          transitionType: "archived",
          note: input.notes,
          actorUserId: actor.userId,
          requestId: actor.requestId,
        });
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "project.archived",
          entityType: "project",
          entityId: updated.id,
          requestId: actor.requestId,
          metadata: {
            reason: input.reason,
            revisit: input.revisit,
            starred: input.starred,
          },
        });
        return updated;
      });
      return toContract(row);
    },

    async restore(id: string, version: number, actor: Actor): Promise<Project> {
      const row = await withTransaction(db, async (tx) => {
        const existing = requireProject(
          await projectRepository.findById(tx, id),
        );
        if (!existing.archivedAt) {
          throw new ApiError(
            409,
            "PROJECT_NOT_ARCHIVED",
            "This project is not archived.",
          );
        }
        const updated = requireFresh(
          await projectRepository.restore(tx, { id, expectedVersion: version }),
        );
        await projectRepository.appendStageHistory(tx, {
          projectId: updated.id,
          fromStage: existing.stage,
          toStage: existing.archivedFromStage ?? existing.stage,
          transitionType: "restored",
          actorUserId: actor.userId,
          requestId: actor.requestId,
        });
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "project.restored",
          entityType: "project",
          entityId: updated.id,
          requestId: actor.requestId,
        });
        return updated;
      });
      return toContract(row);
    },

    async delete(id: string, version: number, actor: Actor): Promise<void> {
      await withTransaction(db, async (tx) => {
        requireProject(await projectRepository.findById(tx, id));
        const deleted = requireFresh(
          await projectRepository.softDelete(tx, {
            id,
            expectedVersion: version,
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "project.deleted",
          entityType: "project",
          entityId: deleted.id,
          requestId: actor.requestId,
        });
      });
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
