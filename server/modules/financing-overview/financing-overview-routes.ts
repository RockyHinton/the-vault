import { Router } from "express";
import { projectIdParamSchema } from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import type { FinancingOverviewService } from "./financing-overview-service";

/** `GET /api/v1/projects/:projectId/financing-overview`: read-only, derived. */
export function createFinancingOverviewRouter(
  service: FinancingOverviewService,
): Router {
  const router = Router({ mergeParams: true });
  router.get(
    "/",
    handle(async (req, res) => {
      const { projectId } = validate(projectIdParamSchema, req.params);
      res
        .status(200)
        .json({ data: await service.get(projectId), requestId: req.requestId });
    }),
  );
  return router;
}
