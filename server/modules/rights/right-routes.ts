import { Router, type Request } from "express";
import {
  attachNewOwnerDocumentSchema,
  changeRightStatusSchema,
  createRightSchema,
  projectIdParamSchema,
  rightDocumentParamSchema,
  rightIdParamSchema,
  updateRightSchema,
  versionOnlySchema,
} from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import type { RightActor, RightService } from "./right-service";

/** `/api/v1/projects/:projectId/rights`. Mounted behind `requireLocalUser` with `mergeParams`. */
export function createRightRouter(service: RightService): Router {
  const router = Router({ mergeParams: true });
  const projectId = (req: Request) =>
    validate(projectIdParamSchema, req.params).projectId;
  const ids = (req: Request) => validate(rightIdParamSchema, req.params);
  const actor = (req: Request): RightActor => ({
    userId: req.localUser!.id,
    role: req.localUser!.role,
    requestId: req.requestId,
  });

  router.get(
    "/",
    handle(async (req, res) => {
      const items = await service.list(projectId(req));
      res.json({ data: { items }, requestId: req.requestId });
    }),
  );

  router.post(
    "/",
    handle(async (req, res) => {
      const right = await service.create(
        projectId(req),
        validate(createRightSchema, req.body),
        actor(req),
      );
      res.status(201).json({ data: right, requestId: req.requestId });
    }),
  );

  router.get(
    "/:rightId",
    handle(async (req, res) => {
      const params = ids(req);
      const right = await service.get(params.projectId, params.rightId);
      res.json({ data: right, requestId: req.requestId });
    }),
  );

  router.patch(
    "/:rightId",
    handle(async (req, res) => {
      const params = ids(req);
      const right = await service.update(
        params.projectId,
        params.rightId,
        validate(updateRightSchema, req.body),
        actor(req),
      );
      res.json({ data: right, requestId: req.requestId });
    }),
  );

  router.post(
    "/:rightId/status",
    handle(async (req, res) => {
      const params = ids(req);
      const right = await service.changeStatus(
        params.projectId,
        params.rightId,
        validate(changeRightStatusSchema, req.body),
        actor(req),
      );
      res.json({ data: right, requestId: req.requestId });
    }),
  );

  router.delete(
    "/:rightId",
    handle(async (req, res) => {
      const params = ids(req);
      const { version } = validate(versionOnlySchema, req.body);
      await service.delete(
        params.projectId,
        params.rightId,
        version,
        actor(req),
      );
      res.status(204).end();
    }),
  );

  router.post(
    "/:rightId/documents",
    handle(async (req, res) => {
      const params = ids(req);
      const right = await service.attachNewDocument(
        params.projectId,
        params.rightId,
        validate(attachNewOwnerDocumentSchema, req.body),
        actor(req),
      );
      res.status(201).json({ data: right, requestId: req.requestId });
    }),
  );

  router.put(
    "/:rightId/documents/:documentId",
    handle(async (req, res) => {
      const params = validate(rightDocumentParamSchema, req.params);
      const right = await service.attachExistingDocument(
        params.projectId,
        params.rightId,
        params.documentId,
        actor(req),
      );
      res.json({ data: right, requestId: req.requestId });
    }),
  );

  router.delete(
    "/:rightId/documents/:documentId",
    handle(async (req, res) => {
      const params = validate(rightDocumentParamSchema, req.params);
      const right = await service.detachDocument(
        params.projectId,
        params.rightId,
        params.documentId,
        actor(req),
      );
      res.json({ data: right, requestId: req.requestId });
    }),
  );

  return router;
}
