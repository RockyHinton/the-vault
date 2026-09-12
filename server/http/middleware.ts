import { randomUUID } from "crypto";
import type { RequestHandler } from "express";
import { log } from "../observability/logger";

declare module "express-serve-static-core" {
  interface Request {
    requestId: string;
    localUser?: {
      id: string;
      clerkUserId: string;
      role: "studio_admin" | "user";
      status: "active" | "suspended";
      email: string | null;
      displayName: string | null;
    };
  }
}

export const requestId: RequestHandler = (req, res, next) => {
  const supplied = req.header("x-request-id");
  req.requestId =
    supplied &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      supplied,
    )
      ? supplied
      : randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
};

export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = performance.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      log("info", "http.request_completed", {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      });
    }
  });
  next();
};
