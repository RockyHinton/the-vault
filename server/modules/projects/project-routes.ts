import { Router } from "express";
import {
  archiveProjectSchema,
  createProjectSchema,
  deleteProjectSchema,
  projectListQuerySchema,
  projectIdParamSchema,
  restoreProjectSchema,
  transitionProjectStageSchema,
  updateProjectSchema,
} from "@shared/contracts";
import type { Request } from "express";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import { requireStudioAdmin } from "../auth/auth-service";
import type { Actor, ProjectService } from "./project-service";

/**
 * Thin HTTP adapter: validate input, check role, call the service, respond.
 * The router is mounted behind `requireLocalUser`, so `req.localUser` exists.
 */
export function createProjectRouter(service: ProjectService): Router {
  const router = Router();
  const projectId = (req: Request) =>
    validate(projectIdParamSchema, req.params).projectId;
  const actor = (req: Request): Actor => ({
    userId: req.localUser!.id,
    requestId: req.requestId,
  });

  router.get(
    "/",
    handle(async (req, res) => {
      const result = await service.list(
        validate(projectListQuerySchema, req.query),
      );
      res.json({ data: result, requestId: req.requestId });
    }),
  );

  router.post(
    "/",
    requireStudioAdmin,
    handle(async (req, res) => {
      const project = await service.create(
        validate(createProjectSchema, req.body),
        actor(req),
      );
      res.status(201).json({ data: project, requestId: req.requestId });
    }),
  );

  router.get(
    "/:projectId",
    handle(async (req, res) => {
      const project = await service.get(projectId(req));
      res.json({ data: project, requestId: req.requestId });
    }),
  );

  router.patch(
    "/:projectId",
    requireStudioAdmin,
    handle(async (req, res) => {
      const project = await service.update(
        projectId(req),
        validate(updateProjectSchema, req.body),
        actor(req),
      );
      res.json({ data: project, requestId: req.requestId });
    }),
  );

  router.post(
    "/:projectId/stage-transitions",
    requireStudioAdmin,
    handle(async (req, res) => {
      const project = await service.transition(
        projectId(req),
        validate(transitionProjectStageSchema, req.body),
        actor(req),
      );
      res.json({ data: project, requestId: req.requestId });
    }),
  );

  router.post(
    "/:projectId/archive",
    requireStudioAdmin,
    handle(async (req, res) => {
      const project = await service.archive(
        projectId(req),
        validate(archiveProjectSchema, req.body),
        actor(req),
      );
      res.json({ data: project, requestId: req.requestId });
    }),
  );

  router.post(
    "/:projectId/restore",
    requireStudioAdmin,
    handle(async (req, res) => {
      const { version } = validate(restoreProjectSchema, req.body);
      const project = await service.restore(
        projectId(req),
        version,
        actor(req),
      );
      res.json({ data: project, requestId: req.requestId });
    }),
  );

  router.delete(
    "/:projectId",
    requireStudioAdmin,
    handle(async (req, res) => {
      const { version } = validate(deleteProjectSchema, req.body);
      await service.delete(projectId(req), version, actor(req));
      res.status(204).end();
    }),
  );

  return router;
}
