import { Router, type RequestHandler } from "express";
import { meSchema } from "@shared/contracts";
import type { Database } from "./db/client";
import { notFound } from "./http/errors";
import { handle } from "./http/handler";
import { createProjectRouter } from "./modules/projects/project-routes";
import type { ProjectService } from "./modules/projects/project-service";

export interface ApiRouterDependencies {
  db: Database;
  requireLocalUser: RequestHandler;
  projectService: ProjectService;
}

/** `/api/v1`. Add a domain here by mounting its router behind `requireLocalUser`. */
export function createApiRouter(deps: ApiRouterDependencies): Router {
  const api = Router();

  api.get("/health", (req, res) => {
    res.status(200).json({ data: { status: "ok" }, requestId: req.requestId });
  });
  api.get(
    "/ready",
    handle(async (req, res) => {
      await deps.db.execute("select 1");
      res
        .status(200)
        .json({ data: { status: "ready" }, requestId: req.requestId });
    }),
  );

  api.get("/auth/me", deps.requireLocalUser, (req, res) => {
    // Output contract check: a failure here is a server bug and surfaces as 500.
    const data = meSchema.parse({ user: req.localUser });
    res.json({ data, requestId: req.requestId });
  });
  api.use(
    "/projects",
    deps.requireLocalUser,
    createProjectRouter(deps.projectService),
  );
  api.use(notFound);

  return api;
}
