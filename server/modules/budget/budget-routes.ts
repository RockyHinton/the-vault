import { Router, type Request } from "express";
import {
  attachNewOwnerDocumentSchema,
  budgetDepartmentDocumentParamSchema,
  budgetDepartmentParamSchema,
  budgetLineItemParamSchema,
  budgetVersionParamSchema,
  createBudgetDepartmentSchema,
  createBudgetLineItemSchema,
  createBudgetSchema,
  projectIdParamSchema,
  updateBudgetDepartmentSchema,
  updateBudgetLineItemSchema,
  versionOnlySchema,
} from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import type { BudgetActor, BudgetService } from "./budget-service";

/**
 * `/api/v1/projects/:projectId/budget`. Mounted behind `requireLocalUser`
 * with `mergeParams`. Lifecycle is explicit (`submit`, `lock`, `revisions`);
 * content commands address departments and line items by id, each resolved
 * through its version and budget back to the project in the path.
 */
export function createBudgetRouter(service: BudgetService): Router {
  const router = Router({ mergeParams: true });
  const projectId = (req: Request) =>
    validate(projectIdParamSchema, req.params).projectId;
  const actor = (req: Request): BudgetActor => ({
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
          validate(createBudgetSchema, req.body),
          actor(req),
        ),
        201,
      ),
    ),
  );

  router.get(
    "/versions/:versionId",
    handle(async (req, res) => {
      const params = validate(budgetVersionParamSchema, req.params);
      ok(
        req,
        res,
        await service.getVersion(params.projectId, params.versionId),
      );
    }),
  );

  router.post(
    "/versions/:versionId/submit",
    handle(async (req, res) => {
      const params = validate(budgetVersionParamSchema, req.params);
      const { version } = validate(versionOnlySchema, req.body);
      ok(
        req,
        res,
        await service.submit(
          params.projectId,
          params.versionId,
          version,
          actor(req),
        ),
      );
    }),
  );

  router.post(
    "/versions/:versionId/lock",
    handle(async (req, res) => {
      const params = validate(budgetVersionParamSchema, req.params);
      const { version } = validate(versionOnlySchema, req.body);
      ok(
        req,
        res,
        await service.lock(
          params.projectId,
          params.versionId,
          version,
          actor(req),
        ),
      );
    }),
  );

  router.post(
    "/versions/:versionId/revisions",
    handle(async (req, res) => {
      const params = validate(budgetVersionParamSchema, req.params);
      ok(
        req,
        res,
        await service.startRevision(
          params.projectId,
          params.versionId,
          actor(req),
        ),
        201,
      );
    }),
  );

  router.post(
    "/versions/:versionId/departments",
    handle(async (req, res) => {
      const params = validate(budgetVersionParamSchema, req.params);
      ok(
        req,
        res,
        await service.createDepartment(
          params.projectId,
          params.versionId,
          validate(createBudgetDepartmentSchema, req.body),
          actor(req),
        ),
        201,
      );
    }),
  );

  router.patch(
    "/departments/:departmentId",
    handle(async (req, res) => {
      const params = validate(budgetDepartmentParamSchema, req.params);
      ok(
        req,
        res,
        await service.renameDepartment(
          params.projectId,
          params.departmentId,
          validate(updateBudgetDepartmentSchema, req.body),
          actor(req),
        ),
      );
    }),
  );

  router.delete(
    "/departments/:departmentId",
    handle(async (req, res) => {
      const params = validate(budgetDepartmentParamSchema, req.params);
      ok(
        req,
        res,
        await service.deleteDepartment(
          params.projectId,
          params.departmentId,
          actor(req),
        ),
      );
    }),
  );

  router.post(
    "/departments/:departmentId/line-items",
    handle(async (req, res) => {
      const params = validate(budgetDepartmentParamSchema, req.params);
      ok(
        req,
        res,
        await service.createLineItem(
          params.projectId,
          params.departmentId,
          validate(createBudgetLineItemSchema, req.body),
          actor(req),
        ),
        201,
      );
    }),
  );

  router.patch(
    "/line-items/:lineItemId",
    handle(async (req, res) => {
      const params = validate(budgetLineItemParamSchema, req.params);
      ok(
        req,
        res,
        await service.updateLineItem(
          params.projectId,
          params.lineItemId,
          validate(updateBudgetLineItemSchema, req.body),
          actor(req),
        ),
      );
    }),
  );

  router.delete(
    "/line-items/:lineItemId",
    handle(async (req, res) => {
      const params = validate(budgetLineItemParamSchema, req.params);
      const { version } = validate(versionOnlySchema, req.body);
      ok(
        req,
        res,
        await service.deleteLineItem(
          params.projectId,
          params.lineItemId,
          version,
          actor(req),
        ),
      );
    }),
  );

  router.post(
    "/departments/:departmentId/documents",
    handle(async (req, res) => {
      const params = validate(budgetDepartmentParamSchema, req.params);
      ok(
        req,
        res,
        await service.attachNewDocument(
          params.projectId,
          params.departmentId,
          validate(attachNewOwnerDocumentSchema, req.body),
          actor(req),
        ),
        201,
      );
    }),
  );

  router.put(
    "/departments/:departmentId/documents/:documentId",
    handle(async (req, res) => {
      const params = validate(budgetDepartmentDocumentParamSchema, req.params);
      ok(
        req,
        res,
        await service.attachExistingDocument(
          params.projectId,
          params.departmentId,
          params.documentId,
          actor(req),
        ),
      );
    }),
  );

  router.delete(
    "/departments/:departmentId/documents/:documentId",
    handle(async (req, res) => {
      const params = validate(budgetDepartmentDocumentParamSchema, req.params);
      ok(
        req,
        res,
        await service.detachDocument(
          params.projectId,
          params.departmentId,
          params.documentId,
          actor(req),
        ),
      );
    }),
  );

  return router;
}
