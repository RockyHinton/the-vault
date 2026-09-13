import { Router, type Request } from "express";
import {
  attachNewOwnerDocumentSchema,
  createLegalRecordSchema,
  legalRecordDocumentParamSchema,
  legalRecordIdParamSchema,
  legalRecordListQuerySchema,
  projectIdParamSchema,
  updateLegalRecordSchema,
  versionOnlySchema,
} from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import type { LegalActor, LegalRecordService } from "./legal-record-service";

/** `/api/v1/projects/:projectId/legal-records`. Mounted behind `requireLocalUser` with `mergeParams`. */
export function createLegalRecordRouter(service: LegalRecordService): Router {
  const router = Router({ mergeParams: true });
  const projectId = (req: Request) =>
    validate(projectIdParamSchema, req.params).projectId;
  const ids = (req: Request) => validate(legalRecordIdParamSchema, req.params);
  const docIds = (req: Request) =>
    validate(legalRecordDocumentParamSchema, req.params);
  const actor = (req: Request): LegalActor => ({
    userId: req.localUser!.id,
    role: req.localUser!.role,
    requestId: req.requestId,
  });

  router.get(
    "/",
    handle(async (req, res) => {
      const items = await service.list(
        projectId(req),
        validate(legalRecordListQuerySchema, req.query),
      );
      res.json({ data: { items }, requestId: req.requestId });
    }),
  );

  router.post(
    "/",
    handle(async (req, res) => {
      const record = await service.create(
        projectId(req),
        validate(createLegalRecordSchema, req.body),
        actor(req),
      );
      res.status(201).json({ data: record, requestId: req.requestId });
    }),
  );

  router.get(
    "/:recordId",
    handle(async (req, res) => {
      const params = ids(req);
      const record = await service.get(params.projectId, params.recordId);
      res.json({ data: record, requestId: req.requestId });
    }),
  );

  router.patch(
    "/:recordId",
    handle(async (req, res) => {
      const params = ids(req);
      const record = await service.update(
        params.projectId,
        params.recordId,
        validate(updateLegalRecordSchema, req.body),
        actor(req),
      );
      res.json({ data: record, requestId: req.requestId });
    }),
  );

  router.delete(
    "/:recordId",
    handle(async (req, res) => {
      const params = ids(req);
      const { version } = validate(versionOnlySchema, req.body);
      await service.delete(
        params.projectId,
        params.recordId,
        version,
        actor(req),
      );
      res.status(204).end();
    }),
  );

  router.post(
    "/:recordId/documents",
    handle(async (req, res) => {
      const params = ids(req);
      const record = await service.attachNewDocument(
        params.projectId,
        params.recordId,
        validate(attachNewOwnerDocumentSchema, req.body),
        actor(req),
      );
      res.status(201).json({ data: record, requestId: req.requestId });
    }),
  );

  router.put(
    "/:recordId/documents/:documentId",
    handle(async (req, res) => {
      const params = docIds(req);
      const record = await service.attachExistingDocument(
        params.projectId,
        params.recordId,
        params.documentId,
        actor(req),
      );
      res.json({ data: record, requestId: req.requestId });
    }),
  );

  router.delete(
    "/:recordId/documents/:documentId",
    handle(async (req, res) => {
      const params = docIds(req);
      const record = await service.detachDocument(
        params.projectId,
        params.recordId,
        params.documentId,
        actor(req),
      );
      res.json({ data: record, requestId: req.requestId });
    }),
  );

  return router;
}
