import { Router, type RequestHandler } from "express";
import type { Database } from "./db/client";
import { notFound } from "./http/errors";
import { handle } from "./http/handler";
import { createAuditRouter } from "./modules/audit/audit-routes";
import { createAuthRouter } from "./modules/auth/auth-routes";
import type { AuthService } from "./modules/auth/auth-service";
import type { CookiePolicy } from "./modules/auth/session-cookie";
import { createProjectRouter } from "./modules/projects/project-routes";
import type { ProjectService } from "./modules/projects/project-service";
import { createUserRouter } from "./modules/users/user-routes";
import type { UserService } from "./modules/users/user-service";

export interface ApiRouterDependencies {
  db: Database;
  auth: AuthService;
  cookiePolicy: CookiePolicy;
  requireLocalUser: RequestHandler;
  projectService: ProjectService;
  userService: UserService;
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

  api.use(
    "/auth",
    createAuthRouter({
      auth: deps.auth,
      cookiePolicy: deps.cookiePolicy,
      requireLocalUser: deps.requireLocalUser,
    }),
  );
  api.use(
    "/projects",
    deps.requireLocalUser,
    createProjectRouter(deps.projectService),
  );
  api.use("/users", deps.requireLocalUser, createUserRouter(deps.userService));
  api.use("/audit-events", deps.requireLocalUser, createAuditRouter(deps.db));
  api.use(notFound);

  return api;
}
