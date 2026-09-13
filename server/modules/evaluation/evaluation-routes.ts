import { Router, type Request } from "express";
import {
  deleteReviewSchema,
  projectIdParamSchema,
  reviewIdParamSchema,
  saveEvaluationSchema,
  submitReviewSchema,
} from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import { requireStudioAdmin } from "../auth/auth-service";
import type { EvaluationActor, EvaluationService } from "./evaluation-service";

const actor = (req: Request): EvaluationActor => ({
  userId: req.localUser!.id,
  role: req.localUser!.role,
  requestId: req.requestId,
});

/** `/api/v1/projects/:projectId/evaluation`. Reads for any user; saves for studio_admin. */
export function createEvaluationRouter(service: EvaluationService): Router {
  const router = Router({ mergeParams: true });
  const projectId = (req: Request) =>
    validate(projectIdParamSchema, req.params).projectId;

  router.get(
    "/",
    handle(async (req, res) => {
      const evaluation = await service.getEvaluation(projectId(req));
      res.json({ data: evaluation, requestId: req.requestId });
    }),
  );

  router.put(
    "/",
    requireStudioAdmin,
    handle(async (req, res) => {
      const evaluation = await service.saveEvaluation(
        projectId(req),
        validate(saveEvaluationSchema, req.body),
        actor(req),
      );
      res.json({ data: evaluation, requestId: req.requestId });
    }),
  );

  return router;
}

/** `/api/v1/projects/:projectId/reviews`. Every active user authors exactly one. */
export function createReviewRouter(service: EvaluationService): Router {
  const router = Router({ mergeParams: true });
  const projectId = (req: Request) =>
    validate(projectIdParamSchema, req.params).projectId;

  router.get(
    "/",
    handle(async (req, res) => {
      const items = await service.listReviews(projectId(req));
      res.json({ data: { items }, requestId: req.requestId });
    }),
  );

  router.put(
    "/mine",
    handle(async (req, res) => {
      const review = await service.submitOwnReview(
        projectId(req),
        validate(submitReviewSchema, req.body),
        actor(req),
      );
      res.json({ data: review, requestId: req.requestId });
    }),
  );

  router.delete(
    "/:reviewId",
    handle(async (req, res) => {
      const params = validate(reviewIdParamSchema, req.params);
      const { version } = validate(deleteReviewSchema, req.body);
      await service.deleteReview(
        params.projectId,
        params.reviewId,
        version,
        actor(req),
      );
      res.status(204).end();
    }),
  );

  return router;
}
