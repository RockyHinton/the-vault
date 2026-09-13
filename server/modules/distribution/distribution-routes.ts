import { Router, type Request, type Response } from "express";
import {
  attachNewOwnerDocumentSchema,
  changeDistributionTerritoryStatusSchema,
  createDistributionTerritoryNoteSchema,
  createDistributionTerritorySchema,
  distributionTerritoryDocumentParamSchema,
  distributionTerritoryNoteParamSchema,
  distributionTerritoryParamSchema,
  projectIdParamSchema,
  updateDistributionTerritoryNoteSchema,
  updateDistributionTerritorySchema,
  versionOnlySchema,
} from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import type {
  DistributionActor,
  DistributionService,
} from "./distribution-service";

/**
 * `/api/v1/projects/:projectId/distribution/territories`. Mounted behind
 * `requireLocalUser` with `mergeParams`. Territory commands return the whole
 * territory (deal, notes, documents); the list returns summaries with counts.
 */
export function createDistributionRouter(service: DistributionService): Router {
  const router = Router({ mergeParams: true });
  const projectId = (req: Request) =>
    validate(projectIdParamSchema, req.params).projectId;
  const ids = (req: Request) =>
    validate(distributionTerritoryParamSchema, req.params);
  const actor = (req: Request): DistributionActor => ({
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
    "/territories",
    handle(async (req, res) =>
      ok(req, res, { items: await service.list(projectId(req)) }),
    ),
  );
  router.post(
    "/territories",
    handle(async (req, res) =>
      ok(
        req,
        res,
        await service.create(
          projectId(req),
          validate(createDistributionTerritorySchema, req.body),
          actor(req),
        ),
        201,
      ),
    ),
  );
  router.get(
    "/territories/:territoryId",
    handle(async (req, res) => {
      const params = ids(req);
      ok(req, res, await service.get(params.projectId, params.territoryId));
    }),
  );
  router.patch(
    "/territories/:territoryId",
    handle(async (req, res) => {
      const params = ids(req);
      ok(
        req,
        res,
        await service.update(
          params.projectId,
          params.territoryId,
          validate(updateDistributionTerritorySchema, req.body),
          actor(req),
        ),
      );
    }),
  );
  router.post(
    "/territories/:territoryId/status",
    handle(async (req, res) => {
      const params = ids(req);
      ok(
        req,
        res,
        await service.changeStatus(
          params.projectId,
          params.territoryId,
          validate(changeDistributionTerritoryStatusSchema, req.body),
          actor(req),
        ),
      );
    }),
  );
  router.delete(
    "/territories/:territoryId",
    handle(async (req, res) => {
      const params = ids(req);
      const { version } = validate(versionOnlySchema, req.body);
      await service.delete(
        params.projectId,
        params.territoryId,
        version,
        actor(req),
      );
      res.status(204).end();
    }),
  );

  router.post(
    "/territories/:territoryId/notes",
    handle(async (req, res) => {
      const params = ids(req);
      ok(
        req,
        res,
        await service.createNote(
          params.projectId,
          params.territoryId,
          validate(createDistributionTerritoryNoteSchema, req.body),
          actor(req),
        ),
        201,
      );
    }),
  );
  router.patch(
    "/territories/:territoryId/notes/:noteId",
    handle(async (req, res) => {
      const params = validate(distributionTerritoryNoteParamSchema, req.params);
      ok(
        req,
        res,
        await service.updateNote(
          params.projectId,
          params.territoryId,
          params.noteId,
          validate(updateDistributionTerritoryNoteSchema, req.body),
          actor(req),
        ),
      );
    }),
  );
  router.delete(
    "/territories/:territoryId/notes/:noteId",
    handle(async (req, res) => {
      const params = validate(distributionTerritoryNoteParamSchema, req.params);
      const { version } = validate(versionOnlySchema, req.body);
      ok(
        req,
        res,
        await service.deleteNote(
          params.projectId,
          params.territoryId,
          params.noteId,
          version,
          actor(req),
        ),
      );
    }),
  );

  router.post(
    "/territories/:territoryId/documents",
    handle(async (req, res) => {
      const params = ids(req);
      ok(
        req,
        res,
        await service.attachNewDocument(
          params.projectId,
          params.territoryId,
          validate(attachNewOwnerDocumentSchema, req.body),
          actor(req),
        ),
        201,
      );
    }),
  );
  router.put(
    "/territories/:territoryId/documents/:documentId",
    handle(async (req, res) => {
      const params = validate(
        distributionTerritoryDocumentParamSchema,
        req.params,
      );
      ok(
        req,
        res,
        await service.attachExistingDocument(
          params.projectId,
          params.territoryId,
          params.documentId,
          actor(req),
        ),
      );
    }),
  );
  router.delete(
    "/territories/:territoryId/documents/:documentId",
    handle(async (req, res) => {
      const params = validate(
        distributionTerritoryDocumentParamSchema,
        req.params,
      );
      ok(
        req,
        res,
        await service.detachDocument(
          params.projectId,
          params.territoryId,
          params.documentId,
          actor(req),
        ),
      );
    }),
  );

  return router;
}
