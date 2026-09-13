import { Router, type Request } from "express";
import {
  attachNewOwnerDocumentSchema,
  changeFinanceSourceStatusSchema,
  createFinancePlanSchema,
  createFinanceSourceSchema,
  financeSourceDocumentParamSchema,
  financeSourceParamSchema,
  projectIdParamSchema,
  rebaseFinancePlanSchema,
  updateFinanceSourceSchema,
  versionOnlySchema,
} from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import type { FinanceActor, FinancePlanService } from "./finance-plan-service";

/**
 * `/api/v1/projects/:projectId/finance-plan`. Mounted behind `requireLocalUser`
 * with `mergeParams`. Every command returns the whole plan with its summary,
 * so the client never recomputes financing totals.
 */
export function createFinancePlanRouter(service: FinancePlanService): Router {
  const router = Router({ mergeParams: true });
  const projectId = (req: Request) =>
    validate(projectIdParamSchema, req.params).projectId;
  const ids = (req: Request) => validate(financeSourceParamSchema, req.params);
  const actor = (req: Request): FinanceActor => ({
    userId: req.localUser!.id,
    role: req.localUser!.role,
    requestId: req.requestId,
  });
  const ok = (
    req: Request,
    res: Parameters<Parameters<typeof handle>[0]>[1],
    data: unknown,
    status = 200,
  ): void => {
    res.status(status).json({ data, requestId: req.requestId });
  };

  router.get(
    "/",
    handle(async (req, res) => ok(req, res, await service.get(projectId(req)))),
  );

  router.post(
    "/",
    handle(async (req, res) =>
      ok(
        req,
        res,
        await service.create(
          projectId(req),
          validate(createFinancePlanSchema, req.body),
          actor(req),
        ),
        201,
      ),
    ),
  );

  router.post(
    "/budget-version",
    handle(async (req, res) =>
      ok(
        req,
        res,
        await service.rebase(
          projectId(req),
          validate(rebaseFinancePlanSchema, req.body),
          actor(req),
        ),
      ),
    ),
  );

  router.post(
    "/sources",
    handle(async (req, res) =>
      ok(
        req,
        res,
        await service.createSource(
          projectId(req),
          validate(createFinanceSourceSchema, req.body),
          actor(req),
        ),
        201,
      ),
    ),
  );

  router.patch(
    "/sources/:sourceId",
    handle(async (req, res) => {
      const params = ids(req);
      ok(
        req,
        res,
        await service.updateSource(
          params.projectId,
          params.sourceId,
          validate(updateFinanceSourceSchema, req.body),
          actor(req),
        ),
      );
    }),
  );

  router.post(
    "/sources/:sourceId/status",
    handle(async (req, res) => {
      const params = ids(req);
      ok(
        req,
        res,
        await service.changeSourceStatus(
          params.projectId,
          params.sourceId,
          validate(changeFinanceSourceStatusSchema, req.body),
          actor(req),
        ),
      );
    }),
  );

  router.post(
    "/sources/:sourceId/approve",
    handle(async (req, res) => {
      const params = ids(req);
      const { version } = validate(versionOnlySchema, req.body);
      ok(
        req,
        res,
        await service.approveSource(
          params.projectId,
          params.sourceId,
          version,
          actor(req),
        ),
      );
    }),
  );

  router.delete(
    "/sources/:sourceId",
    handle(async (req, res) => {
      const params = ids(req);
      const { version } = validate(versionOnlySchema, req.body);
      ok(
        req,
        res,
        await service.deleteSource(
          params.projectId,
          params.sourceId,
          version,
          actor(req),
        ),
      );
    }),
  );

  router.post(
    "/sources/:sourceId/documents",
    handle(async (req, res) => {
      const params = ids(req);
      ok(
        req,
        res,
        await service.attachNewDocument(
          params.projectId,
          params.sourceId,
          validate(attachNewOwnerDocumentSchema, req.body),
          actor(req),
        ),
        201,
      );
    }),
  );

  router.put(
    "/sources/:sourceId/documents/:documentId",
    handle(async (req, res) => {
      const params = validate(financeSourceDocumentParamSchema, req.params);
      ok(
        req,
        res,
        await service.attachExistingDocument(
          params.projectId,
          params.sourceId,
          params.documentId,
          actor(req),
        ),
      );
    }),
  );

  router.delete(
    "/sources/:sourceId/documents/:documentId",
    handle(async (req, res) => {
      const params = validate(financeSourceDocumentParamSchema, req.params);
      ok(
        req,
        res,
        await service.detachDocument(
          params.projectId,
          params.sourceId,
          params.documentId,
          actor(req),
        ),
      );
    }),
  );

  return router;
}
