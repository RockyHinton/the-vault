import { createServer, type Server } from "node:http";
import express, { type Express } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { allowedHosts, type Environment } from "./config/env";
import type { Database } from "./db/client";
import { errorHandler } from "./http/errors";
import type { FileStorage } from "./files/file-storage";
import { requestId, requestLogger } from "./http/middleware";
import { hostAllowlist, mutationOriginGuard } from "./http/request-guards";
import {
  createAuthService,
  createRequireLocalUser,
} from "./modules/auth/auth-service";
import type { CookiePolicy } from "./modules/auth/session-cookie";
import { createDocumentService } from "./modules/documents/document-service";
import { createEvaluationService } from "./modules/evaluation/evaluation-service";
import { createNoteService } from "./modules/notes/note-service";
import { createLegalRecordService } from "./modules/legal/legal-record-service";
import { createPersonService } from "./modules/people/person-service";
import { createRightService } from "./modules/rights/right-service";
import { createTaskService } from "./modules/tasks/task-service";
import { createFileService } from "./modules/files/file-service";
import { createProjectService } from "./modules/projects/project-service";
import { createUserService } from "./modules/users/user-service";
import { createApiRouter } from "./routes";
import { serveStatic } from "./static";

export interface VaultServerOptions {
  env: Environment;
  db: Database;
  /** Where file bytes live; chosen by `createFileStorage(env)` in the entrypoint. */
  storage: FileStorage;
  /** `static` serves the built client, `vite` runs the dev server, `none` is API only. */
  frontend: "none" | "static" | "vite";
}

export interface VaultServer {
  app: Express;
  httpServer: Server;
}

/**
 * Rate limits are per client IP and per process (in-memory). Budgets are
 * split by route family so a busy workspace (one query per domain per page)
 * is never throttled by the tighter write, login and provisioning limits.
 */
const rateLimits = {
  read: { windowMs: 60_000, limit: 600 },
  write: { windowMs: 60_000, limit: 120 },
  /** Failed attempts only; successful logins do not consume the budget. */
  login: { windowMs: 60_000, limit: 10, skipSuccessfulRequests: true },
  provisioning: { windowMs: 60_000, limit: 20 },
} as const;

function limiter(
  name: keyof typeof rateLimits,
  applies: (req: express.Request) => boolean,
) {
  return rateLimit({
    ...rateLimits[name],
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (req) => !applies(req),
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again shortly.",
          requestId: req.requestId,
        },
      });
    },
  });
}

const isRead = (req: express.Request) =>
  req.method === "GET" || req.method === "HEAD";
const isWrite = (req: express.Request) => !isRead(req);

/**
 * Composition root. Everything the process needs is built here, in one place,
 * from an explicit environment and database handle: middleware order,
 * authentication, domain services, API router, frontend and error handler.
 */
export async function createVaultServer(
  options: VaultServerOptions,
): Promise<VaultServer> {
  const { env, db, storage } = options;
  const production = env.NODE_ENV === "production";
  const app = express();
  const httpServer = createServer(app);
  const hosts = allowedHosts(env);
  const cookiePolicy: CookiePolicy = { secure: production };

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(requestId);
  app.use(hostAllowlist(hosts));
  app.use(
    mutationOriginGuard(hosts, {
      requireOrigin: production,
      requireHttps: production,
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: production ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  app.use(requestLogger);
  app.use("/api", limiter("read", isRead));
  app.use("/api", limiter("write", isWrite));
  app.use("/api/v1/auth/login", limiter("login", isWrite));
  app.use(
    "/api/v1/users",
    limiter(
      "provisioning",
      (req) => req.method === "POST" && (req.path === "/" || req.path === ""),
    ),
  );

  const auth = createAuthService({ db });
  const requireLocalUser = createRequireLocalUser({ auth, cookiePolicy });
  app.use(
    "/api/v1",
    createApiRouter({
      db,
      auth,
      cookiePolicy,
      requireLocalUser,
      projectService: createProjectService({ db }),
      userService: createUserService({ db }),
      fileService: createFileService({
        db,
        storage,
        maxUploadBytes: env.VAULT_MAX_UPLOAD_BYTES,
      }),
      documentService: createDocumentService({ db }),
      evaluationService: createEvaluationService({ db }),
      noteService: createNoteService({ db }),
      personService: createPersonService({ db }),
      rightService: createRightService({ db }),
      legalRecordService: createLegalRecordService({ db }),
      taskService: createTaskService({ db }),
    }),
  );

  if (options.frontend === "static") {
    serveStatic(app);
  } else if (options.frontend === "vite") {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  app.use(errorHandler);
  return { app, httpServer };
}
