import type { CreateTaskInput, Task, UpdateTaskInput } from "@shared/contracts";
import type { Database } from "../../db/client";
import type { Transaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { appendAuditEvent } from "../audit/audit-repository";
import { withLiveProjectTransaction } from "../projects/live-project";
import { projectRepository } from "../projects/project-repository";
import { toUserRef } from "../users/user-ref";
import { userRepository } from "../users/user-repository";
import {
  taskRepository,
  type TaskEditableFields,
  type TaskRecord,
} from "./task-repository";

export interface TaskActor {
  userId: string;
  role: "studio_admin" | "user";
  requestId: string;
}

function toContract(record: TaskRecord): Task {
  const { task, createdBy, assignee } = record;
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    description: task.description,
    category: task.category,
    priority: task.priority,
    status: task.status,
    assignee: assignee ? toUserRef(assignee) : null,
    createdBy: toUserRef(createdBy),
    completedAt: task.completedAt?.toISOString() ?? null,
    version: task.version,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function requireTask(record: TaskRecord | undefined): TaskRecord {
  if (!record)
    throw new ApiError(404, "TASK_NOT_FOUND", "The task was not found.");
  return record;
}

function requireFresh<T>(row: T | undefined): T {
  if (!row)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "This task changed while you were editing. Refresh and try again.",
    );
  return row;
}

/** Editing text and deleting follow the authored-record rule; status and assignment are collaborative. */
function assertCanManage(actor: TaskActor, record: TaskRecord): void {
  if (actor.role === "studio_admin") return;
  if (record.task.createdByUserId === actor.userId) return;
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Only the creator or a studio administrator can change this task.",
  );
}

async function requireProject(tx: Transaction | Database, projectId: string) {
  const project = await projectRepository.findById(tx, projectId);
  if (!project)
    throw new ApiError(404, "PROJECT_NOT_FOUND", "The project was not found.");
}

/** Assignment convention: an assignee must be an active user of this deployment. */
async function requireAssignable(tx: Transaction, userId: string | null) {
  if (userId === null) return;
  const user = await userRepository.findById(tx, userId);
  if (!user || user.status !== "active") {
    throw new ApiError(
      422,
      "ASSIGNEE_NOT_ASSIGNABLE",
      "Tasks can only be assigned to active Vault users.",
    );
  }
}

/**
 * Project tasks: any active user creates, assigns, completes and reopens
 * (the board is collaborative); the creator or an admin edits text and
 * deletes. Status moves only through the explicit complete/reopen commands.
 */
export function createTaskService({ db }: { db: Database }) {
  const reload = async (projectId: string, taskId: string) =>
    toContract(
      requireTask(await taskRepository.findById(db, { projectId, taskId })),
    );

  return {
    async list(projectId: string): Promise<Task[]> {
      await requireProject(db, projectId);
      return (await taskRepository.listByProject(db, projectId)).map(
        toContract,
      );
    },

    async create(
      projectId: string,
      input: CreateTaskInput,
      actor: TaskActor,
    ): Promise<Task> {
      const assigneeUserId = input.assigneeUserId ?? null;
      const id = await withLiveProjectTransaction(db, projectId, async (tx) => {
        await requireAssignable(tx, assigneeUserId);
        const created = await taskRepository.insert(tx, {
          projectId,
          title: input.title,
          description: input.description || null,
          category: input.category,
          priority: input.priority,
          assigneeUserId,
          createdByUserId: actor.userId,
        });
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "task.created",
          entityType: "project_task",
          entityId: created.id,
          requestId: actor.requestId,
          metadata: { projectId, category: input.category, assigneeUserId },
        });
        return created.id;
      });
      return reload(projectId, id);
    },

    async update(
      projectId: string,
      taskId: string,
      input: UpdateTaskInput,
      actor: TaskActor,
    ): Promise<Task> {
      const values: TaskEditableFields = {
        title: input.title,
        description:
          input.description === undefined
            ? undefined
            : input.description || null,
        category: input.category,
        priority: input.priority,
        assigneeUserId: input.assigneeUserId,
      };
      const changedFields = (
        Object.keys(values) as (keyof TaskEditableFields)[]
      ).filter((key) => values[key] !== undefined);
      await withLiveProjectTransaction(db, projectId, async (tx) => {
        const existing = requireTask(
          await taskRepository.findById(tx, { projectId, taskId }),
        );
        // Reassignment is collaborative; changing the text is the creator's or an admin's.
        const editsText = changedFields.some((key) => key !== "assigneeUserId");
        if (editsText) assertCanManage(actor, existing);
        if (input.assigneeUserId !== undefined)
          await requireAssignable(tx, input.assigneeUserId);
        requireFresh(
          await taskRepository.updateFields(tx, {
            id: taskId,
            expectedVersion: input.version,
            values,
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "task.updated",
          entityType: "project_task",
          entityId: taskId,
          requestId: actor.requestId,
          metadata: { projectId, changedFields },
        });
      });
      return reload(projectId, taskId);
    },

    async complete(
      projectId: string,
      taskId: string,
      version: number,
      actor: TaskActor,
    ): Promise<Task> {
      await withLiveProjectTransaction(db, projectId, async (tx) => {
        const existing = requireTask(
          await taskRepository.findById(tx, { projectId, taskId }),
        );
        if (existing.task.status === "done")
          throw new ApiError(
            409,
            "TASK_ALREADY_DONE",
            "This task is already done.",
          );
        requireFresh(
          await taskRepository.complete(tx, {
            id: taskId,
            expectedVersion: version,
            completedAt: new Date(),
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "task.completed",
          entityType: "project_task",
          entityId: taskId,
          requestId: actor.requestId,
          metadata: { projectId },
        });
      });
      return reload(projectId, taskId);
    },

    async reopen(
      projectId: string,
      taskId: string,
      version: number,
      actor: TaskActor,
    ): Promise<Task> {
      await withLiveProjectTransaction(db, projectId, async (tx) => {
        const existing = requireTask(
          await taskRepository.findById(tx, { projectId, taskId }),
        );
        if (existing.task.status === "open")
          throw new ApiError(
            409,
            "TASK_ALREADY_OPEN",
            "This task is already open.",
          );
        requireFresh(
          await taskRepository.reopen(tx, {
            id: taskId,
            expectedVersion: version,
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "task.reopened",
          entityType: "project_task",
          entityId: taskId,
          requestId: actor.requestId,
          metadata: { projectId },
        });
      });
      return reload(projectId, taskId);
    },

    async delete(
      projectId: string,
      taskId: string,
      version: number,
      actor: TaskActor,
    ): Promise<void> {
      await withLiveProjectTransaction(db, projectId, async (tx) => {
        const existing = requireTask(
          await taskRepository.findById(tx, { projectId, taskId }),
        );
        assertCanManage(actor, existing);
        requireFresh(
          await taskRepository.softDelete(tx, {
            id: taskId,
            expectedVersion: version,
            deletedAt: new Date(),
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "task.deleted",
          entityType: "project_task",
          entityId: taskId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            createdByUserId: existing.task.createdByUserId,
          },
        });
      });
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
