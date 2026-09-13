import type {
  Evaluation,
  Review,
  SaveEvaluationInput,
  SubmitReviewInput,
} from "@shared/contracts";
import type { Database } from "../../db/client";
import { withTransaction, type Transaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { appendAuditEvent } from "../audit/audit-repository";
import { projectRepository } from "../projects/project-repository";
import { toUserRef } from "../users/user-ref";
import {
  evaluationRepository,
  reviewRepository,
  type EvaluationFields,
  type EvaluationRecord,
  type ReviewRecord,
} from "./evaluation-repository";
import { recommendationFor } from "./review-recommendation";

export interface EvaluationActor {
  userId: string;
  role: "studio_admin" | "user";
  requestId: string;
}

function toEvaluationContract(record: EvaluationRecord): Evaluation {
  const { evaluation, updatedBy } = record;
  return {
    projectId: evaluation.projectId,
    writer: evaluation.writer,
    director: evaluation.director,
    plannedBudget: evaluation.plannedBudget,
    financeTypes: evaluation.financeTypes,
    gates: {
      scriptApproved: evaluation.scriptApproved,
      budgetApproved: evaluation.budgetApproved,
      financeApproved: evaluation.financeApproved,
      talentAttached: evaluation.talentAttached,
    },
    version: evaluation.version,
    updatedBy: toUserRef(updatedBy),
    updatedAt: evaluation.updatedAt.toISOString(),
  };
}

/** What a project looks like before anyone has saved an evaluation. */
function emptyEvaluation(projectId: string): Evaluation {
  return {
    projectId,
    writer: null,
    director: null,
    plannedBudget: null,
    financeTypes: [],
    gates: {
      scriptApproved: false,
      budgetApproved: false,
      financeApproved: false,
      talentAttached: false,
    },
    version: 0,
    updatedBy: null,
    updatedAt: null,
  };
}

function toReviewContract(record: ReviewRecord): Review {
  const { review, author } = record;
  return {
    id: review.id,
    projectId: review.projectId,
    author: toUserRef(author),
    scores: {
      script: review.scriptScore,
      director: review.directorScore,
      cast: review.castScore,
      financing: review.financingScore,
    },
    recommendation: review.recommendation,
    summaryNotes: review.summaryNotes,
    version: review.version,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
  };
}

function conflict(): never {
  throw new ApiError(
    409,
    "VERSION_CONFLICT",
    "This changed while you were editing. Refresh and try again.",
  );
}

async function requireProject(
  executor: Transaction | Database,
  projectId: string,
) {
  const project = await projectRepository.findById(executor, projectId);
  if (!project)
    throw new ApiError(404, "PROJECT_NOT_FOUND", "The project was not found.");
  return project;
}

const blankToNull = (value: string | null) => (value ? value : null);

/**
 * Evaluation use-cases: the per-project profile and gates (studio_admin
 * writes), and team reviews (each active user writes their own). Both are
 * versioned aggregates: `version: 0` creates, otherwise compare-and-set.
 */
export function createEvaluationService({ db }: { db: Database }) {
  return {
    async getEvaluation(projectId: string): Promise<Evaluation> {
      await requireProject(db, projectId);
      const record = await evaluationRepository.findByProjectId(db, projectId);
      return record ? toEvaluationContract(record) : emptyEvaluation(projectId);
    },

    /** studio_admin only (enforced at the route); creates or updates in one command. */
    async saveEvaluation(
      projectId: string,
      input: SaveEvaluationInput,
      actor: EvaluationActor,
    ): Promise<Evaluation> {
      const values: EvaluationFields = {
        writer: blankToNull(input.writer),
        director: blankToNull(input.director),
        plannedBudget: blankToNull(input.plannedBudget),
        financeTypes: input.financeTypes,
        scriptApproved: input.gates.scriptApproved,
        budgetApproved: input.gates.budgetApproved,
        financeApproved: input.gates.financeApproved,
        talentAttached: input.gates.talentAttached,
      };
      const record = await withTransaction(db, async (tx) => {
        await requireProject(tx, projectId);
        const existing = await evaluationRepository.findByProjectId(
          tx,
          projectId,
        );
        if (input.version === 0) {
          if (existing) conflict();
          await evaluationRepository.insert(tx, {
            ...values,
            projectId,
            updatedByUserId: actor.userId,
          });
          await appendAuditEvent(tx, {
            actorUserId: actor.userId,
            action: "evaluation.created",
            entityType: "project_evaluation",
            entityId: projectId,
            requestId: actor.requestId,
          });
        } else {
          if (!existing) conflict();
          const updated = await evaluationRepository.updateIfVersionMatches(
            tx,
            {
              projectId,
              expectedVersion: input.version,
              values,
              updatedByUserId: actor.userId,
            },
          );
          if (!updated) conflict();
          const changedFields = (
            Object.keys(values) as (keyof EvaluationFields)[]
          ).filter(
            (key) =>
              JSON.stringify(values[key]) !==
              JSON.stringify(existing.evaluation[key]),
          );
          await appendAuditEvent(tx, {
            actorUserId: actor.userId,
            action: "evaluation.updated",
            entityType: "project_evaluation",
            entityId: projectId,
            requestId: actor.requestId,
            metadata: { changedFields },
          });
        }
        const saved = await evaluationRepository.findByProjectId(tx, projectId);
        if (!saved)
          throw new Error("Evaluation vanished inside its own transaction.");
        return saved;
      });
      return toEvaluationContract(record);
    },

    async listReviews(projectId: string): Promise<Review[]> {
      await requireProject(db, projectId);
      const rows = await reviewRepository.listByProject(db, projectId);
      return rows.map(toReviewContract);
    },

    /**
     * The caller's own review: created with `version: 0`, replaced with the
     * current version. Authorship always comes from the session, so a user
     * can never write another reviewer's verdict.
     */
    async submitOwnReview(
      projectId: string,
      input: SubmitReviewInput,
      actor: EvaluationActor,
    ): Promise<Review> {
      const values = {
        scriptScore: input.scores.script,
        directorScore: input.scores.director,
        castScore: input.scores.cast,
        financingScore: input.scores.financing,
        recommendation: recommendationFor(input.scores),
        summaryNotes: input.summaryNotes,
      };
      const id = await withTransaction(db, async (tx) => {
        await requireProject(tx, projectId);
        const existing = await reviewRepository.findByAuthor(tx, {
          projectId,
          authorUserId: actor.userId,
        });
        if (input.version === 0) {
          if (existing) conflict();
          const created = await reviewRepository.insert(tx, {
            ...values,
            projectId,
            authorUserId: actor.userId,
          });
          await appendAuditEvent(tx, {
            actorUserId: actor.userId,
            action: "review.submitted",
            entityType: "project_review",
            entityId: created.id,
            requestId: actor.requestId,
            metadata: { projectId, recommendation: values.recommendation },
          });
          return created.id;
        }
        if (!existing) conflict();
        const updated = await reviewRepository.updateIfVersionMatches(tx, {
          id: existing.id,
          expectedVersion: input.version,
          values,
        });
        if (!updated) conflict();
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "review.updated",
          entityType: "project_review",
          entityId: updated.id,
          requestId: actor.requestId,
          metadata: { projectId, recommendation: values.recommendation },
        });
        return updated.id;
      });
      const record = await reviewRepository.findById(db, {
        projectId,
        reviewId: id,
      });
      if (!record) throw new Error("Review vanished after submit.");
      return toReviewContract(record);
    },

    /** Authors delete their own review; a studio_admin may remove any. */
    async deleteReview(
      projectId: string,
      reviewId: string,
      version: number,
      actor: EvaluationActor,
    ): Promise<void> {
      await withTransaction(db, async (tx) => {
        const existing = await reviewRepository.findById(tx, {
          projectId,
          reviewId,
        });
        if (!existing)
          throw new ApiError(
            404,
            "REVIEW_NOT_FOUND",
            "The review was not found.",
          );
        if (
          existing.review.authorUserId !== actor.userId &&
          actor.role !== "studio_admin"
        ) {
          throw new ApiError(
            403,
            "FORBIDDEN",
            "Only the reviewer or a studio administrator can delete this review.",
          );
        }
        const deleted = await reviewRepository.deleteIfVersionMatches(tx, {
          id: reviewId,
          expectedVersion: version,
        });
        if (!deleted) conflict();
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "review.deleted",
          entityType: "project_review",
          entityId: reviewId,
          requestId: actor.requestId,
          metadata: { projectId, authorUserId: existing.review.authorUserId },
        });
      });
    },
  };
}

export type EvaluationService = ReturnType<typeof createEvaluationService>;
