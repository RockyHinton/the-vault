import { createServer } from "http";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { readEnvironment } from "./config/env";
import { errorHandler } from "./http/errors";
import { requestId, requestLogger } from "./http/middleware";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
  hostAllowlist,
  mutationOriginGuard,
} from "./middlewares/clerkProxyMiddleware";
import { log } from "./observability/logger";
import {
  createRequireLocalUser,
  type VerifiedIdentity,
} from "./modules/auth/auth-service";

export interface TestAppOptions {
  /** Test-only identity seam. It still passes through local-user lookup and policy. */
  verifiedIdentity?: VerifiedIdentity;
}

export function createApp(options: TestAppOptions = {}) {
  if (options.verifiedIdentity && process.env.NODE_ENV !== "test") {
    throw new Error(
      "Test identity injection is only available when NODE_ENV=test.",
    );
  }
  const app = express();
  const env = readEnvironment();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  const allowedHosts =
    env.NODE_ENV === "production"
      ? env
          .REPLIT_DOMAINS!.split(",")
          .map((host) => host.trim())
          .filter(Boolean)
      : [env.REPLIT_DEV_DOMAIN, "localhost", "127.0.0.1"].filter(
          (host): host is string => Boolean(host),
        );
  app.use(hostAllowlist(allowedHosts));
  app.use(mutationOriginGuard(allowedHosts, env.NODE_ENV === "production"));
  app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production" ? undefined : false,
    }),
  );
  app.use(requestId);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    })),
  );
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
  if (options.verifiedIdentity) {
    app.locals.requireLocalUser = createRequireLocalUser(
      () => options.verifiedIdentity,
    );
  }
  return app;
}

async function start() {
  const env = readEnvironment();
  const app = createApp();
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app, {
    requireLocalUser: app.locals.requireLocalUser,
  });
  if (env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }
  app.use(errorHandler);

  httpServer.listen({ port: env.PORT, host: "0.0.0.0" }, () => {
    log("info", "server.started", {
      port: env.PORT,
      environment: env.NODE_ENV,
    });
  });
}

if (
  process.env.VITEST !== "true" &&
  process.env.VAULT_TEST_APP_FACTORY !== "true"
) {
  start().catch((error: unknown) => {
    log("error", "server.start_failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    process.exit(1);
  });
}
