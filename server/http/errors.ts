import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { log } from "../observability/logger";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, _res, next) =>
  next(new ApiError(404, "NOT_FOUND", "The requested resource was not found."));

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  void _next;
  const requestId = req.requestId ?? "00000000-0000-0000-0000-000000000000";
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request was invalid.",
        details: error.flatten(),
        requestId,
      },
    });
  }

  const apiError = error instanceof ApiError ? error : undefined;
  const status = apiError?.status ?? 500;
  log(status >= 500 ? "error" : "warn", "http.request_failed", {
    requestId,
    method: req.method,
    path: req.path,
    status,
    code: apiError?.code ?? "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return res.status(status).json({
    error: {
      code: apiError?.code ?? "INTERNAL_ERROR",
      message: apiError?.message ?? "An unexpected server error occurred.",
      requestId,
    },
  });
};
