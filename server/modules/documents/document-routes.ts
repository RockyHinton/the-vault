import { Router, type Request } from "express";
import {
  addDocumentVersionSchema,
  createDocumentSchema,
  deleteDocumentSchema,
  documentIdParamSchema,
  documentListQuerySchema,
  projectIdParamSchema,
  updateDocumentSchema,
} from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import type { DocumentActor, DocumentService } from "./document-service";

/**
 * `/api/v1/projects/:projectId/documents`. Mounted behind `requireLocalUser`
 * with `mergeParams`, so `projectId` arrives from the parent path. Any active
 * user may read and upload; edits and deletion follow the authorship rule in
 * the service.
 */
export function createDocumentRouter(service: DocumentService): Router {
  const router = Router({ mergeParams: true });
  const projectId = (req: Request) =>
    validate(projectIdParamSchema, req.params).projectId;
  const ids = (req: Request) => validate(documentIdParamSchema, req.params);
  const actor = (req: Request): DocumentActor => ({
    userId: req.localUser!.id,
    role: req.localUser!.role,
    requestId: req.requestId,
  });

  router.get(
    "/",
    handle(async (req, res) => {
      const items = await service.list(
        projectId(req),
        validate(documentListQuerySchema, req.query),
      );
      res.json({ data: { items }, requestId: req.requestId });
    }),
  );

  router.post(
    "/",
    handle(async (req, res) => {
      const document = await service.create(
        projectId(req),
        validate(createDocumentSchema, req.body),
        actor(req),
      );
      res.status(201).json({ data: document, requestId: req.requestId });
    }),
  );

  router.get(
    "/:documentId",
    handle(async (req, res) => {
      const params = ids(req);
      const result = await service.get(params.projectId, params.documentId);
      res.json({ data: result, requestId: req.requestId });
    }),
  );

  router.post(
    "/:documentId/versions",
    handle(async (req, res) => {
      const params = ids(req);
      const document = await service.addVersion(
        params.projectId,
        params.documentId,
        validate(addDocumentVersionSchema, req.body),
        actor(req),
      );
      res.status(201).json({ data: document, requestId: req.requestId });
    }),
  );

  router.patch(
    "/:documentId",
    handle(async (req, res) => {
      const params = ids(req);
      const document = await service.update(
        params.projectId,
        params.documentId,
        validate(updateDocumentSchema, req.body),
        actor(req),
      );
      res.json({ data: document, requestId: req.requestId });
    }),
  );

  router.delete(
    "/:documentId",
    handle(async (req, res) => {
      const params = ids(req);
      const { version } = validate(deleteDocumentSchema, req.body);
      await service.delete(
        params.projectId,
        params.documentId,
        version,
        actor(req),
      );
      res.status(204).end();
    }),
  );

  return router;
}
