import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  applicationUsers,
  projectTasks,
  type ProjectTaskRow,
} from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";
import type { UserRefColumns } from "../users/user-ref";

export interface TaskRecord {
  task: ProjectTaskRow;
  createdBy: UserRefColumns;
  assignee: UserRefColumns | null;
}

/** Only what an edit may change; status moves through explicit commands. */
export type TaskEditableFields = Partial<
  Pick<
    ProjectTaskRow,
    "title" | "description" | "category" | "priority" | "assigneeUserId"
  >
>;

const creator = alias(applicationUsers, "creator");
const assignee = alias(applicationUsers, "assignee");

function base(executor: DatabaseExecutor) {
  return executor
    .select({
      task: projectTasks,
      createdBy: {
        id: creator.id,
        displayName: creator.displayName,
        email: creator.email,
      },
      assignee: {
        id: assignee.id,
        displayName: assignee.displayName,
        email: assignee.email,
      },
    })
    .from(projectTasks)
    .innerJoin(creator, eq(projectTasks.createdByUserId, creator.id))
    .leftJoin(assignee, eq(projectTasks.assigneeUserId, assignee.id));
}

/** Drizzle nulls the whole aliased object when the left join finds no assignee. */
function toRecord(row: {
  task: ProjectTaskRow;
  createdBy: UserRefColumns;
  assignee: UserRefColumns | null;
}): TaskRecord {
  return { task: row.task, createdBy: row.createdBy, assignee: row.assignee };
}

async function updateIfVersionMatches(
  tx: Transaction,
  input: {
    id: string;
    expectedVersion: number;
    set: TaskEditableFields &
      Partial<Pick<ProjectTaskRow, "status" | "completedAt" | "deletedAt">>;
  },
): Promise<ProjectTaskRow | undefined> {
  const [row] = await tx
    .update(projectTasks)
    .set({
      ...input.set,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectTasks.id, input.id),
        eq(projectTasks.version, input.expectedVersion),
        isNull(projectTasks.deletedAt),
      ),
    )
    .returning();
  return row;
}

/** Persistence for `project_tasks`. Newest first; soft-deleted rows are invisible. */
export const taskRepository = {
  async listByProject(
    executor: DatabaseExecutor,
    projectId: string,
  ): Promise<TaskRecord[]> {
    const rows = await base(executor)
      .where(
        and(
          eq(projectTasks.projectId, projectId),
          isNull(projectTasks.deletedAt),
        ),
      )
      .orderBy(desc(projectTasks.createdAt), desc(projectTasks.id));
    return rows.map(toRecord);
  },

  async findById(
    executor: DatabaseExecutor,
    input: { projectId: string; taskId: string },
  ): Promise<TaskRecord | undefined> {
    const [row] = await base(executor)
      .where(
        and(
          eq(projectTasks.id, input.taskId),
          eq(projectTasks.projectId, input.projectId),
          isNull(projectTasks.deletedAt),
        ),
      )
      .limit(1);
    return row ? toRecord(row) : undefined;
  },

  async insert(
    tx: Transaction,
    input: {
      projectId: string;
      title: string;
      description: string | null;
      category: ProjectTaskRow["category"];
      priority: ProjectTaskRow["priority"];
      assigneeUserId: string | null;
      createdByUserId: string;
    },
  ): Promise<ProjectTaskRow> {
    const [row] = await tx.insert(projectTasks).values(input).returning();
    return row;
  },

  updateFields(
    tx: Transaction,
    input: { id: string; expectedVersion: number; values: TaskEditableFields },
  ): Promise<ProjectTaskRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: input.values,
    });
  },

  complete(
    tx: Transaction,
    input: { id: string; expectedVersion: number; completedAt: Date },
  ): Promise<ProjectTaskRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { status: "done", completedAt: input.completedAt },
    });
  },

  reopen(
    tx: Transaction,
    input: { id: string; expectedVersion: number },
  ): Promise<ProjectTaskRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { status: "open", completedAt: null },
    });
  },

  softDelete(
    tx: Transaction,
    input: { id: string; expectedVersion: number; deletedAt: Date },
  ): Promise<ProjectTaskRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { deletedAt: input.deletedAt },
    });
  },
};
