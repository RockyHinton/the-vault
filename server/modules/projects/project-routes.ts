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
import { requireStudioAdmin } from "../auth/auth-service";
import { ProjectService } from "./project-service";

const service = new ProjectService();
export const projectRouter = Router();
const projectId = (params: unknown) =>
  projectIdParamSchema.parse(params).projectId;

projectRouter.get("/", async (req, res, next) => {
  try {
    const query = projectListQuerySchema.parse(req.query);
    const result = await service.list(query);
    res.json({ data: result, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
});

projectRouter.post("/", requireStudioAdmin, async (req, res, next) => {
  try {
    const project = await service.create(
      createProjectSchema.parse(req.body),
      req.localUser!.id,
      req.requestId,
    );
    res.status(201).json({ data: project, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
});

projectRouter.get("/:projectId", async (req, res, next) => {
  try {
    const project = await service.get(projectId(req.params));
    res.json({ data: project, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
});

projectRouter.patch(
  "/:projectId",
  requireStudioAdmin,
  async (req, res, next) => {
    try {
      const project = await service.update(
        projectId(req.params),
        updateProjectSchema.parse(req.body),
        req.localUser!.id,
        req.requestId,
      );
      res.json({ data: project, requestId: req.requestId });
    } catch (error) {
      next(error);
    }
  },
);

projectRouter.post(
  "/:projectId/stage-transitions",
  requireStudioAdmin,
  async (req, res, next) => {
    try {
      const project = await service.transition(
        projectId(req.params),
        transitionProjectStageSchema.parse(req.body),
        req.localUser!.id,
        req.requestId,
      );
      res.json({ data: project, requestId: req.requestId });
    } catch (error) {
      next(error);
    }
  },
);

projectRouter.post(
  "/:projectId/archive",
  requireStudioAdmin,
  async (req, res, next) => {
    try {
      const project = await service.archive(
        projectId(req.params),
        archiveProjectSchema.parse(req.body),
        req.localUser!.id,
        req.requestId,
      );
      res.json({ data: project, requestId: req.requestId });
    } catch (error) {
      next(error);
    }
  },
);

projectRouter.post(
  "/:projectId/restore",
  requireStudioAdmin,
  async (req, res, next) => {
    try {
      const { version } = restoreProjectSchema.parse(req.body);
      const project = await service.restore(
        projectId(req.params),
        version,
        req.localUser!.id,
        req.requestId,
      );
      res.json({ data: project, requestId: req.requestId });
    } catch (error) {
      next(error);
    }
  },
);

projectRouter.delete(
  "/:projectId",
  requireStudioAdmin,
  async (req, res, next) => {
    try {
      const { version } = deleteProjectSchema.parse(req.body);
      await service.delete(
        projectId(req.params),
        version,
        req.localUser!.id,
        req.requestId,
      );
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
