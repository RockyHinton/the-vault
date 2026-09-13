import { Router, type Request } from "express";
import {
  addScriptVersionSchema,
  createScriptAnnotationSchema,
  createScriptSchema,
  projectIdParamSchema,
  scriptAnnotationIdParamSchema,
  scriptIdParamSchema,
  scriptVersionParamSchema,
  updateScriptAnnotationSchema,
  versionOnlySchema,
} from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import type { ScriptActor, ScriptService } from "./script-service";

/**
 * `/api/v1/projects/:projectId/scripts`. Mounted behind `requireLocalUser`
 * with `mergeParams`. Annotations are addressed under the exact version they
 * belong to (`/:scriptId/versions/:documentId/annotations`); edits and
 * deletes address the annotation itself.
 */
export function createScriptRouter(service: ScriptService): Router {
  const router = Router({ mergeParams: true });
  const projectId = (req: Request) =>
    validate(projectIdParamSchema, req.params).projectId;
  const ids = (req: Request) => validate(scriptIdParamSchema, req.params);
  const actor = (req: Request): ScriptActor => ({
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
      const detail = await service.create(
        projectId(req),
        validate(createScriptSchema, req.body),
        actor(req),
      );
      res.status(201).json({ data: detail, requestId: req.requestId });
    }),
  );

  router.get(
    "/:scriptId",
    handle(async (req, res) => {
      const params = ids(req);
      const detail = await service.get(params.projectId, params.scriptId);
      res.json({ data: detail, requestId: req.requestId });
    }),
  );

  router.post(
    "/:scriptId/versions",
    handle(async (req, res) => {
      const params = ids(req);
      const detail = await service.addVersion(
        params.projectId,
        params.scriptId,
        validate(addScriptVersionSchema, req.body),
        actor(req),
      );
      res.status(201).json({ data: detail, requestId: req.requestId });
    }),
  );

  router.delete(
    "/:scriptId",
    handle(async (req, res) => {
      const params = ids(req);
      await service.delete(params.projectId, params.scriptId, actor(req));
      res.status(204).end();
    }),
  );

  router.get(
    "/:scriptId/versions/:documentId/annotations",
    handle(async (req, res) => {
      const params = validate(scriptVersionParamSchema, req.params);
      const items = await service.listAnnotations(
        params.projectId,
        params.scriptId,
        params.documentId,
      );
      res.json({ data: { items }, requestId: req.requestId });
    }),
  );

  router.post(
    "/:scriptId/versions/:documentId/annotations",
    handle(async (req, res) => {
      const params = validate(scriptVersionParamSchema, req.params);
      const annotation = await service.createAnnotation(
        params.projectId,
        params.scriptId,
        params.documentId,
        validate(createScriptAnnotationSchema, req.body),
        actor(req),
      );
      res.status(201).json({ data: annotation, requestId: req.requestId });
    }),
  );

  router.patch(
    "/:scriptId/annotations/:annotationId",
    handle(async (req, res) => {
      const params = validate(scriptAnnotationIdParamSchema, req.params);
      const annotation = await service.updateAnnotation(
        params.projectId,
        params.scriptId,
        params.annotationId,
        validate(updateScriptAnnotationSchema, req.body),
        actor(req),
      );
      res.json({ data: annotation, requestId: req.requestId });
    }),
  );

  router.delete(
    "/:scriptId/annotations/:annotationId",
    handle(async (req, res) => {
      const params = validate(scriptAnnotationIdParamSchema, req.params);
      const { version } = validate(versionOnlySchema, req.body);
      await service.deleteAnnotation(
        params.projectId,
        params.scriptId,
        params.annotationId,
        version,
        actor(req),
      );
      res.status(204).end();
    }),
  );

  return router;
}
