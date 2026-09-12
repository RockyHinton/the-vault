import type { IncomingHttpHeaders } from "http";
import type { RequestHandler } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { ApiError } from "../http/errors";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
export const CLERK_PROXY_PATH = "/api/__clerk";

export function getClerkProxyHost(req: {
  headers: IncomingHttpHeaders;
}): string | undefined {
  const forwarded = req.headers["x-forwarded-host"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return raw?.split(",")[0]?.trim() || req.headers.host?.trim() || undefined;
}

export function hostAllowlist(allowedHosts: string[]): RequestHandler {
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));
  return (req, _res, next) => {
    const rawHost = getClerkProxyHost(req);
    const host = rawHost?.replace(/:\d+$/, "").toLowerCase();
    if (!host || !allowed.has(host)) {
      next(
        new ApiError(400, "UNTRUSTED_HOST", "The request host is not allowed."),
      );
      return;
    }
    next();
  };
}

export function mutationOriginGuard(
  allowedHosts: string[],
  enforceHttps: boolean,
): RequestHandler {
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));
  return (req, _res, next) => {
    if (!enforceHttps) return next();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
    const origin = req.header("origin");
    if (!origin) {
      return next(
        new ApiError(
          403,
          "INVALID_ORIGIN",
          "A same-origin request is required.",
        ),
      );
    }
    try {
      const parsed = new URL(origin);
      if (
        (enforceHttps && parsed.protocol !== "https:") ||
        !allowed.has(parsed.hostname.toLowerCase())
      ) {
        return next(
          new ApiError(
            403,
            "INVALID_ORIGIN",
            "A same-origin request is required.",
          ),
        );
      }
    } catch {
      return next(
        new ApiError(
          403,
          "INVALID_ORIGIN",
          "A same-origin request is required.",
        ),
      );
    }
    next();
  };
}

export function clerkProxyMiddleware(): RequestHandler {
  if (process.env.NODE_ENV !== "production" || !process.env.CLERK_SECRET_KEY) {
    return (_req, _res, next) => next();
  }

  return createProxyMiddleware({
    target: CLERK_FAPI,
    changeOrigin: true,
    selfHandleResponse: true,
    pathRewrite: (path) => path.replace(new RegExp(`^${CLERK_PROXY_PATH}`), ""),
    on: {
      proxyReq: (proxyReq, req) => {
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = getClerkProxyHost(req) ?? "";
        proxyReq.setHeader(
          "Clerk-Proxy-Url",
          `${protocol}://${host}${CLERK_PROXY_PATH}`,
        );
        proxyReq.setHeader("Clerk-Secret-Key", process.env.CLERK_SECRET_KEY!);
      },
      proxyRes: (proxyRes, req, res) => {
        const headers = { ...proxyRes.headers };
        delete headers["transfer-encoding"];
        delete headers.connection;
        delete headers["keep-alive"];
        const status = proxyRes.statusCode ?? 502;
        const bodyless =
          req.method === "HEAD" ||
          status < 200 ||
          status === 204 ||
          status === 304;
        if (headers["content-length"] !== undefined || bodyless) {
          res.writeHead(status, headers);
          proxyRes.pipe(res);
          return;
        }
        const chunks: Buffer[] = [];
        proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
        proxyRes.on("end", () => {
          const body = Buffer.concat(chunks);
          headers["content-length"] = String(body.length);
          res.writeHead(status, headers);
          res.end(body);
        });
        proxyRes.on("error", () => res.destroy());
      },
    },
  }) as RequestHandler;
}
