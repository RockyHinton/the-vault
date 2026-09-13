import { Router, type Request, type Response } from "express";
import {
  cashFlowDepartmentParamSchema,
  cashFlowPaymentParamSchema,
  createCashFlowPaymentSchema,
  financeSourceParamSchema,
  projectIdParamSchema,
  setCashFlowDepartmentWindowSchema,
  setCashFlowSourceTimingSchema,
  updateCashFlowPaymentSchema,
  updateCashFlowSchema,
  versionOnlySchema,
} from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import type { CashFlowActor, CashFlowService } from "./cash-flow-service";

/**
 * `/api/v1/projects/:projectId/cash-flow`. Mounted behind `requireLocalUser`
 * with `mergeParams`. Every command returns the whole cash flow with its
 * projection, so the client never computes balances.
 */
export function createCashFlowRouter(service: CashFlowService): Router {
  const router = Router({ mergeParams: true });
  const projectId = (req: Request) =>
    validate(projectIdParamSchema, req.params).projectId;
  const actor = (req: Request): CashFlowActor => ({
    userId: req.localUser!.id,
    role: req.localUser!.role,
    requestId: req.requestId,
  });
  const ok = (
    req: Request,
    res: Response,
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
      ok(req, res, await service.create(projectId(req), actor(req)), 201),
    ),
  );
  router.patch(
    "/",
    handle(async (req, res) =>
      ok(
        req,
        res,
        await service.update(
          projectId(req),
          validate(updateCashFlowSchema, req.body),
          actor(req),
        ),
      ),
    ),
  );

  router.put(
    "/departments/:departmentId/window",
    handle(async (req, res) => {
      const params = validate(cashFlowDepartmentParamSchema, req.params);
      ok(
        req,
        res,
        await service.setDepartmentWindow(
          params.projectId,
          params.departmentId,
          validate(setCashFlowDepartmentWindowSchema, req.body),
          actor(req),
        ),
      );
    }),
  );
  router.delete(
    "/departments/:departmentId/window",
    handle(async (req, res) => {
      const params = validate(cashFlowDepartmentParamSchema, req.params);
      const { version } = validate(versionOnlySchema, req.body);
      ok(
        req,
        res,
        await service.clearDepartmentWindow(
          params.projectId,
          params.departmentId,
          version,
          actor(req),
        ),
      );
    }),
  );

  router.post(
    "/payments",
    handle(async (req, res) =>
      ok(
        req,
        res,
        await service.createPayment(
          projectId(req),
          validate(createCashFlowPaymentSchema, req.body),
          actor(req),
        ),
        201,
      ),
    ),
  );
  router.patch(
    "/payments/:paymentId",
    handle(async (req, res) => {
      const params = validate(cashFlowPaymentParamSchema, req.params);
      ok(
        req,
        res,
        await service.updatePayment(
          params.projectId,
          params.paymentId,
          validate(updateCashFlowPaymentSchema, req.body),
          actor(req),
        ),
      );
    }),
  );
  router.delete(
    "/payments/:paymentId",
    handle(async (req, res) => {
      const params = validate(cashFlowPaymentParamSchema, req.params);
      const { version } = validate(versionOnlySchema, req.body);
      ok(
        req,
        res,
        await service.deletePayment(
          params.projectId,
          params.paymentId,
          version,
          actor(req),
        ),
      );
    }),
  );

  router.put(
    "/sources/:sourceId/timing",
    handle(async (req, res) => {
      const params = validate(financeSourceParamSchema, req.params);
      ok(
        req,
        res,
        await service.setSourceTiming(
          params.projectId,
          params.sourceId,
          validate(setCashFlowSourceTimingSchema, req.body),
          actor(req),
        ),
      );
    }),
  );
  router.delete(
    "/sources/:sourceId/timing",
    handle(async (req, res) => {
      const params = validate(financeSourceParamSchema, req.params);
      const { version } = validate(versionOnlySchema, req.body);
      ok(
        req,
        res,
        await service.clearSourceTiming(
          params.projectId,
          params.sourceId,
          version,
          actor(req),
        ),
      );
    }),
  );

  return router;
}
