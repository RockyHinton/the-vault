import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { log } from "../observability/logger";

/**
 * The only error type that reaches clients with its own status, code and
 * message. Everything else is reported as an opaque 500.
 */
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

/**
 * Errors raised by Express body parsing (body-parser / raw-body). They carry
 * a `type` discriminator and an HTTP status; we map the ones a client can
 * cause to stable codes and treat the rest as server failures.
 */
const bodyParserErrorCodes: Record<
  string,
  { status: number; code: string; message: string }
> = {
  "entity.parse.failed": {
    status: 400,
    code: "INVALID_JSON",
    message: "The request body is not valid JSON.",
  },
  "entity.too.large": {
    status: 413,
    code: "PAYLOAD_TOO_LARGE",
    message: "The request body is too large.",
  },
  "encoding.unsupported": {
    status: 415,
    code: "UNSUPPORTED_ENCODING",
    message: "The request encoding is not supported.",
  },
  "charset.unsupported": {
    status: 415,
    code: "UNSUPPORTED_CHARSET",
    message: "The request charset is not supported.",
  },
  "request.aborted": {
    status: 400,
    code: "REQUEST_ABORTED",
    message: "The request was aborted before the body was received.",
  },
};

function fromBodyParserError(error: unknown): ApiError | undefined {
  if (!error || typeof error !== "object" || !("type" in error))
    return undefined;
  const type = (error as { type: unknown }).type;
  if (typeof type !== "string") return undefined;
  const mapped = bodyParserErrorCodes[type];
  return mapped
    ? new ApiError(mapped.status, mapped.code, mapped.message)
    : undefined;
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  const requestId = req.requestId ?? "00000000-0000-0000-0000-000000000000";

  const apiError =
    error instanceof ApiError ? error : fromBodyParserError(error);
  const status = apiError?.status ?? 500;
  // A ZodError reaching this handler was NOT raised by request validation
  // (see http/validation.ts, which converts those to ApiError). It means a
  // server-side contract failed, which is a server bug, not client input.
  const code =
    apiError?.code ??
    (error instanceof ZodError
      ? "RESPONSE_CONTRACT_VIOLATION"
      : "INTERNAL_ERROR");

  log(status >= 500 ? "error" : "warn", "http.request_failed", {
    requestId,
    method: req.method,
    path: req.path,
    status,
    code,
    message: error instanceof Error ? error.message : "Unknown error",
  });

  res.status(status).json({
    error: {
      code: apiError?.code ?? "INTERNAL_ERROR",
      message: apiError?.message ?? "An unexpected server error occurred.",
      ...(apiError?.details !== undefined ? { details: apiError.details } : {}),
      requestId,
    },
  });
};
