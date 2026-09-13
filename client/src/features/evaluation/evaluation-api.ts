import {
  apiSuccessSchema,
  evaluationSchema,
  reviewSchema,
  type SaveEvaluationInput,
  type SubmitReviewInput,
} from "@shared/contracts";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";

const evaluationResponse = apiSuccessSchema(evaluationSchema);
const reviewResponse = apiSuccessSchema(reviewSchema);
const reviewListResponse = apiSuccessSchema(
  z.object({ items: z.array(reviewSchema) }),
);

export const getEvaluation = (projectId: string) =>
  apiClient("GET", `/projects/${projectId}/evaluation`, evaluationResponse);
export const saveEvaluation = (projectId: string, input: SaveEvaluationInput) =>
  apiClient(
    "PUT",
    `/projects/${projectId}/evaluation`,
    evaluationResponse,
    input,
  );

export const listReviews = (projectId: string) =>
  apiClient("GET", `/projects/${projectId}/reviews`, reviewListResponse);
export const submitOwnReview = (projectId: string, input: SubmitReviewInput) =>
  apiClient(
    "PUT",
    `/projects/${projectId}/reviews/mine`,
    reviewResponse,
    input,
  );
export const deleteReview = (
  projectId: string,
  reviewId: string,
  version: number,
) =>
  apiClient(
    "DELETE",
    `/projects/${projectId}/reviews/${reviewId}`,
    z.undefined(),
    {
      version,
    },
  );
