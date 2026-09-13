import { Router, type Request } from "express";
import {
  attachNewPersonDocumentSchema,
  changePersonStatusSchema,
  createPersonSchema,
  personDocumentParamSchema,
  personIdParamSchema,
  personListQuerySchema,
  personVersionSchema,
  projectIdParamSchema,
  updatePersonSchema,
} from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import type { PersonActor, PersonService } from "./person-service";

/**
 * `/api/v1/projects/:projectId/people`. Mounted behind `requireLocalUser`
 * with `mergeParams`. Every lookup is scoped by the project in the path, so a
 * person id from another project answers 404.
 */
export function createPersonRouter(service: PersonService): Router {
  const router = Router({ mergeParams: true });
  const projectId = (req: Request) =>
    validate(projectIdParamSchema, req.params).projectId;
  const ids = (req: Request) => validate(personIdParamSchema, req.params);
  const actor = (req: Request): PersonActor => ({
    userId: req.localUser!.id,
    role: req.localUser!.role,
    requestId: req.requestId,
  });

  router.get(
    "/",
    handle(async (req, res) => {
      const items = await service.list(
        projectId(req),
        validate(personListQuerySchema, req.query),
      );
      res.json({ data: { items }, requestId: req.requestId });
    }),
  );

  router.post(
    "/",
    handle(async (req, res) => {
      const person = await service.create(
        projectId(req),
        validate(createPersonSchema, req.body),
        actor(req),
      );
      res.status(201).json({ data: person, requestId: req.requestId });
    }),
  );

  router.get(
    "/:personId",
    handle(async (req, res) => {
      const params = ids(req);
      const person = await service.get(params.projectId, params.personId);
      res.json({ data: person, requestId: req.requestId });
    }),
  );

  router.patch(
    "/:personId",
    handle(async (req, res) => {
      const params = ids(req);
      const person = await service.update(
        params.projectId,
        params.personId,
        validate(updatePersonSchema, req.body),
        actor(req),
      );
      res.json({ data: person, requestId: req.requestId });
    }),
  );

  router.post(
    "/:personId/status",
    handle(async (req, res) => {
      const params = ids(req);
      const person = await service.changeStatus(
        params.projectId,
        params.personId,
        validate(changePersonStatusSchema, req.body),
        actor(req),
      );
      res.json({ data: person, requestId: req.requestId });
    }),
  );

  router.delete(
    "/:personId",
    handle(async (req, res) => {
      const params = ids(req);
      const { version } = validate(personVersionSchema, req.body);
      await service.delete(
        params.projectId,
        params.personId,
        version,
        actor(req),
      );
      res.status(204).end();
    }),
  );

  router.post(
    "/:personId/documents",
    handle(async (req, res) => {
      const params = ids(req);
      const person = await service.attachNewDocument(
        params.projectId,
        params.personId,
        validate(attachNewPersonDocumentSchema, req.body),
        actor(req),
      );
      res.status(201).json({ data: person, requestId: req.requestId });
    }),
  );

  router.put(
    "/:personId/documents/:documentId",
    handle(async (req, res) => {
      const params = validate(personDocumentParamSchema, req.params);
      const person = await service.attachExistingDocument(
        params.projectId,
        params.personId,
        params.documentId,
        actor(req),
      );
      res.json({ data: person, requestId: req.requestId });
    }),
  );

  router.delete(
    "/:personId/documents/:documentId",
    handle(async (req, res) => {
      const params = validate(personDocumentParamSchema, req.params);
      const person = await service.detachDocument(
        params.projectId,
        params.personId,
        params.documentId,
        actor(req),
      );
      res.json({ data: person, requestId: req.requestId });
    }),
  );

  return router;
}
