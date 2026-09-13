import { Router, type RequestHandler } from "express";
import type { Database } from "./db/client";
import { notFound } from "./http/errors";
import { handle } from "./http/handler";
import { createAuditRouter } from "./modules/audit/audit-routes";
import { createAuthRouter } from "./modules/auth/auth-routes";
import type { AuthService } from "./modules/auth/auth-service";
import type { CookiePolicy } from "./modules/auth/session-cookie";
import { createDocumentRouter } from "./modules/documents/document-routes";
import type { DocumentService } from "./modules/documents/document-service";
import {
  createEvaluationRouter,
  createReviewRouter,
} from "./modules/evaluation/evaluation-routes";
import type { EvaluationService } from "./modules/evaluation/evaluation-service";
import { createFileRouter } from "./modules/files/file-routes";
import { createNoteRouter } from "./modules/notes/note-routes";
import type { NoteService } from "./modules/notes/note-service";
import { createTaskRouter } from "./modules/tasks/task-routes";
import type { TaskService } from "./modules/tasks/task-service";
import type { FileService } from "./modules/files/file-service";
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
  fileService: FileService;
  documentService: DocumentService;
  evaluationService: EvaluationService;
  noteService: NoteService;
  taskService: TaskService;
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
  // Project sub-resources: each domain owns its own router and service.
  api.use(
    "/projects/:projectId/documents",
    deps.requireLocalUser,
    createDocumentRouter(deps.documentService),
  );
  api.use(
    "/projects/:projectId/evaluation",
    deps.requireLocalUser,
    createEvaluationRouter(deps.evaluationService),
  );
  api.use(
    "/projects/:projectId/reviews",
    deps.requireLocalUser,
    createReviewRouter(deps.evaluationService),
  );
  api.use(
    "/projects/:projectId/notes",
    deps.requireLocalUser,
    createNoteRouter(deps.noteService),
  );
  api.use(
    "/projects/:projectId/tasks",
    deps.requireLocalUser,
    createTaskRouter(deps.taskService),
  );
  api.use(
    "/projects",
    deps.requireLocalUser,
    createProjectRouter(deps.projectService),
  );
  api.use("/files", deps.requireLocalUser, createFileRouter(deps.fileService));
  api.use("/users", deps.requireLocalUser, createUserRouter(deps.userService));
  api.use("/audit-events", deps.requireLocalUser, createAuditRouter(deps.db));
  api.use(notFound);

  return api;
}
