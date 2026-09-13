import { Router, type RequestHandler } from "express";
import type { Database } from "./db/client";
import { notFound } from "./http/errors";
import { handle } from "./http/handler";
import { createAuditRouter } from "./modules/audit/audit-routes";
import { createAuthRouter } from "./modules/auth/auth-routes";
import type { AuthService } from "./modules/auth/auth-service";
import type { CookiePolicy } from "./modules/auth/session-cookie";
import { createBudgetRouter } from "./modules/budget/budget-routes";
import type { BudgetService } from "./modules/budget/budget-service";
import { createDocumentRouter } from "./modules/documents/document-routes";
import { createFinancePlanRouter } from "./modules/finance-plan/finance-plan-routes";
import { createCashFlowRouter } from "./modules/cash-flow/cash-flow-routes";
import { createDistributionRouter } from "./modules/distribution/distribution-routes";
import type { DistributionService } from "./modules/distribution/distribution-service";
import type { CashFlowService } from "./modules/cash-flow/cash-flow-service";
import { createFinancingOverviewRouter } from "./modules/financing-overview/financing-overview-routes";
import type { FinancingOverviewService } from "./modules/financing-overview/financing-overview-service";
import type { FinancePlanService } from "./modules/finance-plan/finance-plan-service";
import type { DocumentService } from "./modules/documents/document-service";
import {
  createEvaluationRouter,
  createReviewRouter,
} from "./modules/evaluation/evaluation-routes";
import type { EvaluationService } from "./modules/evaluation/evaluation-service";
import { createFileRouter } from "./modules/files/file-routes";
import { createNoteRouter } from "./modules/notes/note-routes";
import type { NoteService } from "./modules/notes/note-service";
import { createLegalRecordRouter } from "./modules/legal/legal-record-routes";
import type { LegalRecordService } from "./modules/legal/legal-record-service";
import { createPersonRouter } from "./modules/people/person-routes";
import { createRightRouter } from "./modules/rights/right-routes";
import type { RightService } from "./modules/rights/right-service";
import { createScriptRouter } from "./modules/scripts/script-routes";
import type { ScriptService } from "./modules/scripts/script-service";
import type { PersonService } from "./modules/people/person-service";
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
  personService: PersonService;
  rightService: RightService;
  legalRecordService: LegalRecordService;
  scriptService: ScriptService;
  budgetService: BudgetService;
  financePlanService: FinancePlanService;
  cashFlowService: CashFlowService;
  financingOverviewService: FinancingOverviewService;
  distributionService: DistributionService;
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
    "/projects/:projectId/people",
    deps.requireLocalUser,
    createPersonRouter(deps.personService),
  );
  api.use(
    "/projects/:projectId/rights",
    deps.requireLocalUser,
    createRightRouter(deps.rightService),
  );
  api.use(
    "/projects/:projectId/legal-records",
    deps.requireLocalUser,
    createLegalRecordRouter(deps.legalRecordService),
  );
  api.use(
    "/projects/:projectId/scripts",
    deps.requireLocalUser,
    createScriptRouter(deps.scriptService),
  );
  api.use(
    "/projects/:projectId/budget",
    deps.requireLocalUser,
    createBudgetRouter(deps.budgetService),
  );
  api.use(
    "/projects/:projectId/finance-plan",
    deps.requireLocalUser,
    createFinancePlanRouter(deps.financePlanService),
  );
  api.use(
    "/projects/:projectId/cash-flow",
    deps.requireLocalUser,
    createCashFlowRouter(deps.cashFlowService),
  );
  api.use(
    "/projects/:projectId/financing-overview",
    deps.requireLocalUser,
    createFinancingOverviewRouter(deps.financingOverviewService),
  );
  api.use(
    "/projects/:projectId/distribution",
    deps.requireLocalUser,
    createDistributionRouter(deps.distributionService),
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
