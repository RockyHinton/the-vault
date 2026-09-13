import { Router, type RequestHandler } from "express";
import { loginSchema, meSchema } from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import { issueSessionCookie, type AuthService } from "./auth-service";
import {
  clearSessionCookie,
  readSessionToken,
  type CookiePolicy,
} from "./session-cookie";

/** `/api/v1/auth`: login, logout, me. Login is rate limited in the composition root. */
export function createAuthRouter(deps: {
  auth: AuthService;
  cookiePolicy: CookiePolicy;
  requireLocalUser: RequestHandler;
}): Router {
  const router = Router();

  router.post(
    "/login",
    handle(async (req, res) => {
      const input = validate(loginSchema, req.body);
      const session = await deps.auth.login(input, {
        requestId: req.requestId,
        previousToken: readSessionToken(req),
      });
      issueSessionCookie(res, session, deps.cookiePolicy);
      res.json({ data: { user: session.user }, requestId: req.requestId });
    }),
  );

  router.post(
    "/logout",
    handle(async (req, res) => {
      await deps.auth.logout(readSessionToken(req), {
        requestId: req.requestId,
      });
      clearSessionCookie(res, deps.cookiePolicy);
      res.status(204).end();
    }),
  );

  router.get("/me", deps.requireLocalUser, (req, res) => {
    // Output contract check: a failure here is a server bug and surfaces as 500.
    const data = meSchema.parse({ user: req.localUser });
    res.json({ data, requestId: req.requestId });
  });

  return router;
}
