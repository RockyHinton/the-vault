import { useQuery } from "@tanstack/react-query";
import type {
  Evaluation,
  EvaluationGates,
  SaveEvaluationInput,
  SubmitReviewInput,
} from "@shared/contracts";
import { useVaultMutation } from "@/lib/mutations";
import {
  deleteReview,
  getEvaluation,
  listReviews,
  saveEvaluation,
  submitOwnReview,
} from "./evaluation-api";

export const evaluationKey = (projectId: string) =>
  ["evaluation", projectId] as const;
export const reviewsKey = (projectId: string) =>
  ["reviews", projectId] as const;
const auditKey = ["audit-events"] as const;

export function useEvaluation(projectId: string) {
  return useQuery({
    queryKey: evaluationKey(projectId),
    queryFn: () => getEvaluation(projectId),
  });
}

export function useReviews(projectId: string) {
  return useQuery({
    queryKey: reviewsKey(projectId),
    queryFn: () => listReviews(projectId),
  });
}

/** The full save payload for the current evaluation with some fields replaced. */
export function toSaveEvaluationInput(
  evaluation: Evaluation,
  changes: Partial<Omit<SaveEvaluationInput, "version" | "gates">> & {
    gates?: Partial<EvaluationGates>;
  } = {},
): SaveEvaluationInput {
  return {
    writer: changes.writer ?? evaluation.writer,
    director: changes.director ?? evaluation.director,
    plannedBudget: changes.plannedBudget ?? evaluation.plannedBudget,
    financeTypes: changes.financeTypes ?? evaluation.financeTypes,
    gates: { ...evaluation.gates, ...changes.gates },
    version: evaluation.version,
  };
}

export function useSaveEvaluation() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: SaveEvaluationInput;
    }) => saveEvaluation(projectId, input),
    invalidate: ({ projectId }) => [evaluationKey(projectId), auditKey],
    successMessage: "Evaluation saved.",
  });
}

export function useSubmitOwnReview() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: SubmitReviewInput;
    }) => submitOwnReview(projectId, input),
    invalidate: ({ projectId }) => [reviewsKey(projectId), auditKey],
    successMessage: "Review saved.",
  });
}

export function useDeleteReview() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      reviewId,
      version,
    }: {
      projectId: string;
      reviewId: string;
      version: number;
    }) => deleteReview(projectId, reviewId, version),
    invalidate: ({ projectId }) => [reviewsKey(projectId), auditKey],
    successMessage: "Review deleted.",
  });
}
