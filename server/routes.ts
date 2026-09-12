import { Router, type Express } from "express";
import type { Server } from "http";
import { meSchema } from "@shared/contracts";
import { requireLocalUser } from "./modules/auth/auth-service";
import { projectRouter } from "./modules/projects/project-routes";
import { notFound } from "./http/errors";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  dependencies: { requireLocalUser?: typeof requireLocalUser } = {},
): Promise<Server> {
  const api = Router();
  const requireUser = dependencies.requireLocalUser ?? requireLocalUser;

  api.get("/health", (_req, res) => {
    res.status(200).json({ data: { status: "ok" }, requestId: _req.requestId });
  });
  api.get("/ready", async (_req, res, next) => {
    try {
      const { getDatabase } = await import("./db/client");
      await getDatabase().execute("select 1");
      res
        .status(200)
        .json({ data: { status: "ready" }, requestId: _req.requestId });
    } catch (error) {
      next(error);
    }
  });

  api.get("/auth/me", requireUser, (req, res) => {
    const data = meSchema.parse({ user: req.localUser });
    res.json({ data, requestId: req.requestId });
  });
  api.use("/projects", requireUser, projectRouter);
  api.use(notFound);

  app.use("/api/v1", api);
  return httpServer;
}
