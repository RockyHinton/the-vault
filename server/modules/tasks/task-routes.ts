import { Router, type Request } from "express";
import {
  createTaskSchema,
  projectIdParamSchema,
  taskIdParamSchema,
  taskVersionSchema,
  updateTaskSchema,
} from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import type { TaskActor, TaskService } from "./task-service";

/** `/api/v1/projects/:projectId/tasks`. Mounted behind `requireLocalUser`. */
export function createTaskRouter(service: TaskService): Router {
  const router = Router({ mergeParams: true });
  const projectId = (req: Request) =>
    validate(projectIdParamSchema, req.params).projectId;
  const ids = (req: Request) => validate(taskIdParamSchema, req.params);
  const actor = (req: Request): TaskActor => ({
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
      const task = await service.create(
        projectId(req),
        validate(createTaskSchema, req.body),
        actor(req),
      );
      res.status(201).json({ data: task, requestId: req.requestId });
    }),
  );

  router.patch(
    "/:taskId",
    handle(async (req, res) => {
      const params = ids(req);
      const task = await service.update(
        params.projectId,
        params.taskId,
        validate(updateTaskSchema, req.body),
        actor(req),
      );
      res.json({ data: task, requestId: req.requestId });
    }),
  );

  router.post(
    "/:taskId/complete",
    handle(async (req, res) => {
      const params = ids(req);
      const { version } = validate(taskVersionSchema, req.body);
      const task = await service.complete(
        params.projectId,
        params.taskId,
        version,
        actor(req),
      );
      res.json({ data: task, requestId: req.requestId });
    }),
  );

  router.post(
    "/:taskId/reopen",
    handle(async (req, res) => {
      const params = ids(req);
      const { version } = validate(taskVersionSchema, req.body);
      const task = await service.reopen(
        params.projectId,
        params.taskId,
        version,
        actor(req),
      );
      res.json({ data: task, requestId: req.requestId });
    }),
  );

  router.delete(
    "/:taskId",
    handle(async (req, res) => {
      const params = ids(req);
      const { version } = validate(taskVersionSchema, req.body);
      await service.delete(
        params.projectId,
        params.taskId,
        version,
        actor(req),
      );
      res.status(204).end();
    }),
  );

  return router;
}
