import { createServer, type Server } from "node:http";
import express, { type Express } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { allowedHosts, type Environment } from "./config/env";
import type { Database } from "./db/client";
import { errorHandler } from "./http/errors";
import { requestId, requestLogger } from "./http/middleware";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
  hostAllowlist,
  mutationOriginGuard,
} from "./middlewares/clerkProxyMiddleware";
import {
  createRequireLocalUser,
  type VerifiedIdentity,
} from "./modules/auth/auth-service";
import type { ProfileLookup } from "./modules/auth/clerk-profile";
import { createProjectService } from "./modules/projects/project-service";
import { createApiRouter } from "./routes";
import { serveStatic } from "./static";

export interface VaultServerOptions {
  env: Environment;
  db: Database;
  /** `static` serves the built client, `vite` runs the dev server, `none` is API only. */
  frontend: "none" | "static" | "vite";
  /**
   * Test-only identity seam. Replaces Clerk session verification with a fixed
   * identity that still goes through local-user lookup and policy. Refused
   * unless `env.NODE_ENV === "test"`.
   */
  verifiedIdentity?: VerifiedIdentity;
  /** Overrides the Clerk profile lookup used when bootstrapping the first admin. */
  profileLookup?: ProfileLookup;
}

export interface VaultServer {
  app: Express;
  httpServer: Server;
}

/**
 * Composition root. Everything the process needs is built here, in one place,
 * from an explicit environment and database handle: middleware order,
 * authentication, domain services, API router, frontend and error handler.
 */
export async function createVaultServer(
  options: VaultServerOptions,
): Promise<VaultServer> {
  const { env, db } = options;
  if (options.verifiedIdentity && env.NODE_ENV !== "test") {
    throw new Error(
      "Test identity injection is only available when NODE_ENV=test.",
    );
  }

  const app = express();
  const httpServer = createServer(app);
  const hosts = allowedHosts(env);

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(requestId);
  app.use(hostAllowlist(hosts));
  app.use(mutationOriginGuard(hosts, env.NODE_ENV === "production"));
  app.use(CLERK_PROXY_PATH, clerkProxyMiddleware(env));
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === "production" ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  // Clerk verifies the browser session cookie on every request. When the
  // test-only identity seam is active it replaces Clerk verification entirely,
  // so Clerk is not mounted and tests never depend on Clerk's network.
  if (!options.verifiedIdentity) {
    app.use(
      clerkMiddleware((req) => ({
        publishableKey: publishableKeyFromHost(
          getClerkProxyHost(req) ?? "",
          env.CLERK_PUBLISHABLE_KEY,
        ),
        secretKey: env.CLERK_SECRET_KEY,
      })),
    );
  }
  app.use(requestLogger);
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Please try again shortly.",
            requestId: req.requestId,
          },
        });
      },
    }),
  );

  const requireLocalUser = createRequireLocalUser({
    db,
    bootstrapAdminClerkId: env.VAULT_BOOTSTRAP_ADMIN_CLERK_ID,
    identityResolver: options.verifiedIdentity
      ? () => options.verifiedIdentity
      : undefined,
    profileLookup: options.profileLookup,
  });
  app.use(
    "/api/v1",
    createApiRouter({
      db,
      requireLocalUser,
      projectService: createProjectService({ db }),
    }),
  );

  if (options.frontend === "static") {
    serveStatic(app);
  } else if (options.frontend === "vite") {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app, {
      mode: env.NODE_ENV === "test" ? "test" : "development",
      browserTestIdentity: options.verifiedIdentity,
    });
  }

  app.use(errorHandler);
  return { app, httpServer };
}
