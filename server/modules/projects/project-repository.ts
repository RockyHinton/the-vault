import { and, desc, eq, isNotNull, isNull, lt, type SQL } from "drizzle-orm";
import { projects, projectStageHistory, type ProjectRow } from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";

type ProjectInsert = typeof projects.$inferInsert;
export type ProjectStage = ProjectRow["stage"];

/** The only columns a user edit may touch. Narrow on purpose (no mass assignment). */
export type ProjectEditableFields = Partial<
  Pick<ProjectInsert, "title" | "logline" | "synopsis" | "genre">
>;

export type ProjectArchiveFields = {
  reason: NonNullable<ProjectInsert["archiveReason"]>;
  revisit: NonNullable<ProjectInsert["archiveRevisit"]>;
  starred: boolean;
  notes: string | null;
  archivedFromStage: ProjectStage;
};

export type StageHistoryTransition =
  "created" | "stage_changed" | "archived" | "restored";

/**
 * Compare-and-set update. Matches on id + expected version (+ optional extra
 * predicates) so a stale caller updates zero rows and gets `undefined`.
 * Callers run this inside the transaction that also writes history/audit.
 */
async function updateIfVersionMatches(
  tx: Transaction,
  input: {
    id: string;
    expectedVersion: number;
    set: Partial<ProjectInsert>;
    where?: SQL[];
  },
): Promise<ProjectRow | undefined> {
  const [row] = await tx
    .update(projects)
    .set({
      ...input.set,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projects.id, input.id),
        eq(projects.version, input.expectedVersion),
        isNull(projects.deletedAt),
        ...(input.where ?? []),
      ),
    )
    .returning();
  return row;
}

/**
 * Persistence for `projects` and `project_stage_history`. No business rules,
 * no transactions: every function runs on the executor it is given.
 */
export const projectRepository = {
  async list(
    executor: DatabaseExecutor,
    input: {
      archived: "true" | "false" | "all";
      limit: number;
      cursor?: string;
    },
  ): Promise<ProjectRow[]> {
    const filters = [isNull(projects.deletedAt)];
    if (input.archived === "true") filters.push(isNotNull(projects.archivedAt));
    if (input.archived === "false") filters.push(isNull(projects.archivedAt));
    if (input.cursor) filters.push(lt(projects.id, input.cursor));
    return executor
      .select()
      .from(projects)
      .where(and(...filters))
      .orderBy(desc(projects.id))
      .limit(input.limit);
  },

  async findById(
    executor: DatabaseExecutor,
    id: string,
  ): Promise<ProjectRow | undefined> {
    const [row] = await executor
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: {
      title: string;
      logline: string | null;
      synopsis: string | null;
      genre: string | null;
      createdByUserId: string;
    },
  ): Promise<ProjectRow> {
    const [row] = await tx.insert(projects).values(input).returning();
    return row;
  },

  updateFields(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      values: ProjectEditableFields;
    },
  ): Promise<ProjectRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: input.values,
      where: [isNull(projects.archivedAt)],
    });
  },

  changeStage(
    tx: Transaction,
    input: { id: string; expectedVersion: number; toStage: ProjectStage },
  ): Promise<ProjectRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { stage: input.toStage },
      where: [isNull(projects.archivedAt)],
    });
  },

  archive(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      archive: ProjectArchiveFields;
    },
  ): Promise<ProjectRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: {
        archivedAt: new Date(),
        archiveReason: input.archive.reason,
        archiveRevisit: input.archive.revisit,
        archiveStarred: input.archive.starred,
        archiveNotes: input.archive.notes,
        archivedFromStage: input.archive.archivedFromStage,
      },
      where: [isNull(projects.archivedAt)],
    });
  },

  restore(
    tx: Transaction,
    input: { id: string; expectedVersion: number },
  ): Promise<ProjectRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: {
        archivedAt: null,
        archiveReason: null,
        archiveRevisit: null,
        archiveStarred: null,
        archiveNotes: null,
        archivedFromStage: null,
      },
      where: [isNotNull(projects.archivedAt)],
    });
  },

  softDelete(
    tx: Transaction,
    input: { id: string; expectedVersion: number },
  ): Promise<ProjectRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { deletedAt: new Date() },
    });
  },

  async appendStageHistory(
    tx: Transaction,
    input: {
      projectId: string;
      fromStage: ProjectStage | null;
      toStage: ProjectStage;
      transitionType: StageHistoryTransition;
      note?: string;
      actorUserId: string;
      requestId: string;
    },
  ): Promise<void> {
    await tx.insert(projectStageHistory).values({
      projectId: input.projectId,
      fromStage: input.fromStage,
      toStage: input.toStage,
      transitionType: input.transitionType,
      note: input.note ?? null,
      actorUserId: input.actorUserId,
      requestId: input.requestId,
    });
  },
};
