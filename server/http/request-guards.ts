import type { IncomingHttpHeaders } from "node:http";
import type { RequestHandler } from "express";
import { ApiError } from "./errors";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** The host the browser addressed, honouring one trusted proxy hop. */
export function requestHost(req: {
  headers: IncomingHttpHeaders;
}): string | undefined {
  const forwarded = req.headers["x-forwarded-host"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return raw?.split(",")[0]?.trim() || req.headers.host?.trim() || undefined;
}

/** Rejects requests addressed to a hostname this deployment does not serve. */
export function hostAllowlist(allowedHosts: string[]): RequestHandler {
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));
  return (req, _res, next) => {
    const host = requestHost(req)?.replace(/:\d+$/, "").toLowerCase();
    if (!host || !allowed.has(host)) {
      next(
        new ApiError(400, "UNTRUSTED_HOST", "The request host is not allowed."),
      );
      return;
    }
    next();
  };
}

export interface OriginGuardOptions {
  /**
   * Production: every mutation must carry an `Origin` header naming this
   * deployment over HTTPS. Development: a mutation without `Origin` (curl,
   * Supertest) is allowed, but a wrong or cross-site origin is still refused.
   */
  requireOrigin: boolean;
  requireHttps: boolean;
}

/**
 * CSRF defence for cookie-authenticated mutations, complementing the
 * `SameSite=Lax` session cookie: the browser's `Origin` and `Sec-Fetch-Site`
 * headers cannot be forged by another site, so a mutation is accepted only
 * when they say it came from this deployment.
 */
export function mutationOriginGuard(
  allowedHosts: string[],
  options: OriginGuardOptions,
): RequestHandler {
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));
  const refuse = () =>
    new ApiError(403, "INVALID_ORIGIN", "A same-origin request is required.");
  return (req, _res, next) => {
    if (!MUTATING_METHODS.has(req.method)) return next();
    const fetchSite = req.header("sec-fetch-site");
    if (fetchSite === "cross-site") return next(refuse());
    const origin = req.header("origin");
    if (!origin) return next(options.requireOrigin ? refuse() : undefined);
    try {
      const parsed = new URL(origin);
      if (
        (options.requireHttps && parsed.protocol !== "https:") ||
        !allowed.has(parsed.hostname.toLowerCase())
      ) {
        return next(refuse());
      }
    } catch {
      return next(refuse());
    }
    next();
  };
}
