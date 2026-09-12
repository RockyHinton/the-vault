import { and, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import {
  auditEvents,
  projects,
  projectStageHistory,
  type ProjectRow,
} from "@shared/schema";
import { getDatabase } from "../../db/client";

export class ProjectRepository {
  async list(input: {
    archived: "true" | "false" | "all";
    limit: number;
    cursor?: string;
  }) {
    const filters = [isNull(projects.deletedAt)];
    if (input.archived === "true") filters.push(isNotNull(projects.archivedAt));
    if (input.archived === "false") filters.push(isNull(projects.archivedAt));
    if (input.cursor) filters.push(lt(projects.id, input.cursor));
    return getDatabase()
      .select()
      .from(projects)
      .where(and(...filters))
      .orderBy(desc(projects.id))
      .limit(input.limit);
  }

  async findById(id: string) {
    const [project] = await getDatabase()
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
      .limit(1);
    return project;
  }

  async create(
    input: Omit<
      typeof projects.$inferInsert,
      "id" | "version" | "createdAt" | "updatedAt"
    >,
    requestId: string,
  ) {
    return getDatabase().transaction(async (tx) => {
      const [project] = await tx.insert(projects).values(input).returning();
      await tx.insert(projectStageHistory).values({
        projectId: project.id,
        fromStage: null,
        toStage: project.stage,
        transitionType: "created",
        actorUserId: input.createdByUserId,
        requestId,
      });
      await tx.insert(auditEvents).values({
        actorUserId: input.createdByUserId,
        action: "project.created",
        entityType: "project",
        entityId: project.id,
        requestId,
        metadata: { stage: project.stage },
      });
      return project;
    });
  }

  async compareAndUpdate(input: {
    id: string;
    version: number;
    values: Partial<typeof projects.$inferInsert>;
    actorUserId: string;
    requestId: string;
  }): Promise<ProjectRow | undefined> {
    return getDatabase().transaction(async (tx) => {
      const [project] = await tx
        .update(projects)
        .set({
          ...input.values,
          version: input.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projects.id, input.id),
            eq(projects.version, input.version),
            isNull(projects.deletedAt),
          ),
        )
        .returning();
      if (!project) return undefined;
      await tx.insert(auditEvents).values({
        actorUserId: input.actorUserId,
        action: "project.updated",
        entityType: "project",
        entityId: project.id,
        requestId: input.requestId,
        metadata: {
          changedFields: Object.keys(input.values).filter(
            (key) =>
              input.values[key as keyof typeof input.values] !== undefined,
          ),
        },
      });
      return project;
    });
  }

  async transition(input: {
    project: ProjectRow;
    toStage: "evaluation" | "development" | "production";
    version: number;
    actorUserId: string;
    requestId: string;
    note?: string;
  }) {
    return getDatabase().transaction(async (tx) => {
      const [project] = await tx
        .update(projects)
        .set({
          stage: input.toStage,
          version: input.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projects.id, input.project.id),
            eq(projects.version, input.version),
            isNull(projects.archivedAt),
            isNull(projects.deletedAt),
          ),
        )
        .returning();
      if (!project) return undefined;
      await tx.insert(projectStageHistory).values({
        projectId: project.id,
        fromStage: input.project.stage,
        toStage: input.toStage,
        transitionType: "stage_changed",
        note: input.note,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
      });
      await tx.insert(auditEvents).values({
        actorUserId: input.actorUserId,
        action: "project.stage_changed",
        entityType: "project",
        entityId: project.id,
        requestId: input.requestId,
        metadata: { fromStage: input.project.stage, toStage: input.toStage },
      });
      return project;
    });
  }

  async archive(input: {
    project: ProjectRow;
    version: number;
    actorUserId: string;
    requestId: string;
    reason: typeof projects.$inferInsert.archiveReason;
    revisit: typeof projects.$inferInsert.archiveRevisit;
    starred: boolean;
    notes?: string;
  }) {
    return getDatabase().transaction(async (tx) => {
      const [project] = await tx
        .update(projects)
        .set({
          archivedAt: new Date(),
          archiveReason: input.reason,
          archiveRevisit: input.revisit,
          archiveStarred: input.starred,
          archiveNotes: input.notes ?? null,
          archivedFromStage: input.project.stage,
          version: input.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projects.id, input.project.id),
            eq(projects.version, input.version),
            isNull(projects.archivedAt),
            isNull(projects.deletedAt),
          ),
        )
        .returning();
      if (!project) return undefined;
      await tx.insert(projectStageHistory).values({
        projectId: project.id,
        fromStage: input.project.stage,
        toStage: input.project.stage,
        transitionType: "archived",
        note: input.notes,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
      });
      await tx.insert(auditEvents).values({
        actorUserId: input.actorUserId,
        action: "project.archived",
        entityType: "project",
        entityId: project.id,
        requestId: input.requestId,
        metadata: {
          reason: input.reason,
          revisit: input.revisit,
          starred: input.starred,
        },
      });
      return project;
    });
  }

  async restore(input: {
    project: ProjectRow;
    version: number;
    actorUserId: string;
    requestId: string;
  }) {
    return getDatabase().transaction(async (tx) => {
      const [project] = await tx
        .update(projects)
        .set({
          archivedAt: null,
          archiveReason: null,
          archiveRevisit: null,
          archiveStarred: null,
          archiveNotes: null,
          archivedFromStage: null,
          version: input.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projects.id, input.project.id),
            eq(projects.version, input.version),
            isNull(projects.deletedAt),
          ),
        )
        .returning();
      if (!project) return undefined;
      await tx.insert(projectStageHistory).values({
        projectId: project.id,
        fromStage: input.project.stage,
        toStage: input.project.archivedFromStage ?? input.project.stage,
        transitionType: "restored",
        actorUserId: input.actorUserId,
        requestId: input.requestId,
      });
      await tx.insert(auditEvents).values({
        actorUserId: input.actorUserId,
        action: "project.restored",
        entityType: "project",
        entityId: project.id,
        requestId: input.requestId,
        metadata: {},
      });
      return project;
    });
  }

  async softDelete(input: {
    project: ProjectRow;
    version: number;
    actorUserId: string;
    requestId: string;
  }) {
    return getDatabase().transaction(async (tx) => {
      const [project] = await tx
        .update(projects)
        .set({
          deletedAt: new Date(),
          version: input.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projects.id, input.project.id),
            eq(projects.version, input.version),
            isNull(projects.deletedAt),
          ),
        )
        .returning();
      if (!project) return undefined;
      await tx.insert(auditEvents).values({
        actorUserId: input.actorUserId,
        action: "project.deleted",
        entityType: "project",
        entityId: project.id,
        requestId: input.requestId,
        metadata: {},
      });
      return project;
    });
  }
}
