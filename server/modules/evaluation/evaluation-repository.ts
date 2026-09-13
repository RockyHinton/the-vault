import { and, asc, eq } from "drizzle-orm";
import {
  applicationUsers,
  projectEvaluations,
  projectReviews,
  type ProjectEvaluationRow,
  type ProjectReviewRow,
} from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";
import type { UserRefColumns } from "../users/user-ref";

const userRefColumns = {
  id: applicationUsers.id,
  displayName: applicationUsers.displayName,
  email: applicationUsers.email,
};

export interface EvaluationRecord {
  evaluation: ProjectEvaluationRow;
  updatedBy: UserRefColumns;
}

export interface ReviewRecord {
  review: ProjectReviewRow;
  author: UserRefColumns;
}

/** The evaluation fields a save may set. */
export interface EvaluationFields {
  writer: string | null;
  director: string | null;
  plannedBudget: string | null;
  financeTypes: ProjectEvaluationRow["financeTypes"];
  scriptApproved: boolean;
  budgetApproved: boolean;
  financeApproved: boolean;
  talentAttached: boolean;
}

export interface ReviewFields {
  scriptScore: number;
  directorScore: number;
  castScore: number;
  financingScore: number;
  recommendation: ProjectReviewRow["recommendation"];
  summaryNotes: string;
}

/** Persistence for `project_evaluations`. No policy, no transactions. */
export const evaluationRepository = {
  async findByProjectId(
    executor: DatabaseExecutor,
    projectId: string,
  ): Promise<EvaluationRecord | undefined> {
    const [row] = await executor
      .select({ evaluation: projectEvaluations, updatedBy: userRefColumns })
      .from(projectEvaluations)
      .innerJoin(
        applicationUsers,
        eq(projectEvaluations.updatedByUserId, applicationUsers.id),
      )
      .where(eq(projectEvaluations.projectId, projectId))
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: EvaluationFields & { projectId: string; updatedByUserId: string },
  ): Promise<ProjectEvaluationRow> {
    const [row] = await tx.insert(projectEvaluations).values(input).returning();
    return row;
  },

  /** Compare-and-set on the project's row; undefined means stale or missing. */
  async updateIfVersionMatches(
    tx: Transaction,
    input: {
      projectId: string;
      expectedVersion: number;
      values: EvaluationFields;
      updatedByUserId: string;
    },
  ): Promise<ProjectEvaluationRow | undefined> {
    const [row] = await tx
      .update(projectEvaluations)
      .set({
        ...input.values,
        updatedByUserId: input.updatedByUserId,
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectEvaluations.projectId, input.projectId),
          eq(projectEvaluations.version, input.expectedVersion),
        ),
      )
      .returning();
    return row;
  },
};

/** Persistence for `project_reviews`. */
export const reviewRepository = {
  async listByProject(
    executor: DatabaseExecutor,
    projectId: string,
  ): Promise<ReviewRecord[]> {
    return executor
      .select({ review: projectReviews, author: userRefColumns })
      .from(projectReviews)
      .innerJoin(
        applicationUsers,
        eq(projectReviews.authorUserId, applicationUsers.id),
      )
      .where(eq(projectReviews.projectId, projectId))
      .orderBy(asc(projectReviews.createdAt), asc(projectReviews.id));
  },

  async findById(
    executor: DatabaseExecutor,
    input: { projectId: string; reviewId: string },
  ): Promise<ReviewRecord | undefined> {
    const [row] = await executor
      .select({ review: projectReviews, author: userRefColumns })
      .from(projectReviews)
      .innerJoin(
        applicationUsers,
        eq(projectReviews.authorUserId, applicationUsers.id),
      )
      .where(
        and(
          eq(projectReviews.id, input.reviewId),
          eq(projectReviews.projectId, input.projectId),
        ),
      )
      .limit(1);
    return row;
  },

  async findByAuthor(
    executor: DatabaseExecutor,
    input: { projectId: string; authorUserId: string },
  ): Promise<ProjectReviewRow | undefined> {
    const [row] = await executor
      .select()
      .from(projectReviews)
      .where(
        and(
          eq(projectReviews.projectId, input.projectId),
          eq(projectReviews.authorUserId, input.authorUserId),
        ),
      )
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: ReviewFields & { projectId: string; authorUserId: string },
  ): Promise<ProjectReviewRow> {
    const [row] = await tx.insert(projectReviews).values(input).returning();
    return row;
  },

  async updateIfVersionMatches(
    tx: Transaction,
    input: { id: string; expectedVersion: number; values: ReviewFields },
  ): Promise<ProjectReviewRow | undefined> {
    const [row] = await tx
      .update(projectReviews)
      .set({
        ...input.values,
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectReviews.id, input.id),
          eq(projectReviews.version, input.expectedVersion),
        ),
      )
      .returning();
    return row;
  },

  /** Hard delete: a review is an opinion, not provenance; the audit event records it. */
  async deleteIfVersionMatches(
    tx: Transaction,
    input: { id: string; expectedVersion: number },
  ): Promise<ProjectReviewRow | undefined> {
    const [row] = await tx
      .delete(projectReviews)
      .where(
        and(
          eq(projectReviews.id, input.id),
          eq(projectReviews.version, input.expectedVersion),
        ),
      )
      .returning();
    return row;
  },
};
