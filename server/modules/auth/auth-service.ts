import type { Request, RequestHandler, Response } from "express";
import type { LoginInput } from "@shared/contracts";
import type { ApplicationUserRow } from "@shared/schema";
import type { Database } from "../../db/client";
import { withTransaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { log } from "../../observability/logger";
import { appendAuditEvent } from "../audit/audit-repository";
import { userRepository } from "../users/user-repository";
import { credentialRepository } from "./credential-repository";
import {
  dummyPasswordHash,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "./password-hashing";
import {
  SESSION_ABSOLUTE_LIFETIME_MS,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_TOUCH_INTERVAL_MS,
  clearSessionCookie,
  generateSessionToken,
  hashSessionToken,
  readSessionToken,
  setSessionCookie,
  type CookiePolicy,
} from "./session-cookie";
import { sessionRepository } from "./session-repository";

export type LocalUser = NonNullable<Request["localUser"]>;

export function toLocalUser(user: ApplicationUserRow): LocalUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
  };
}

export interface RequestContext {
  requestId: string;
}

export interface IssuedSession {
  user: LocalUser;
  /** Opaque token for the cookie; never persisted. */
  token: string;
  expiresAt: Date;
}

/**
 * Authentication lifecycle, in one place:
 *
 *   login   : email + password → verify hash → new server session → cookie
 *   request : cookie → hashed lookup → not expired, not idle, not revoked,
 *             user still active → req.localUser
 *   logout  : revoke the session, clear the cookie
 *
 * Future email OTP fits between "verify hash" and "new server session"
 * without touching the user or session model.
 */
export function createAuthService({ db }: { db: Database }) {
  async function issueSession(
    user: ApplicationUserRow,
    context: RequestContext,
    previousToken: string | undefined,
  ): Promise<IssuedSession> {
    const { token, tokenHash } = generateSessionToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_LIFETIME_MS);
    await withTransaction(db, async (tx) => {
      // Session rotation: whatever session the browser was carrying is retired.
      if (previousToken) {
        const previous = await sessionRepository.findByTokenHash(
          tx,
          hashSessionToken(previousToken),
        );
        if (previous) await sessionRepository.revoke(tx, previous.id, now);
      }
      await sessionRepository.insert(tx, {
        userId: user.id,
        tokenHash,
        expiresAt,
      });
      await appendAuditEvent(tx, {
        actorUserId: user.id,
        action: "auth.login",
        entityType: "application_user",
        entityId: user.id,
        requestId: context.requestId,
      });
    });
    return { user: toLocalUser(user), token, expiresAt };
  }

  return {
    /**
     * Unknown email and wrong password are indistinguishable to the caller
     * (same code, same message, same hashing cost). A correct password for a
     * suspended account is refused with its own code; the caller has proven
     * they hold the credential, so that is not an enumeration risk.
     */
    async login(
      input: LoginInput,
      context: RequestContext & { previousToken?: string },
    ): Promise<IssuedSession> {
      const user = await userRepository.findByEmail(db, input.email);
      const credential = user
        ? await credentialRepository.findByUserId(db, user.id)
        : undefined;
      const storedHash =
        credential?.passwordHash ?? (await dummyPasswordHash());
      const verified = await verifyPassword(input.password, storedHash);
      if (!user || !credential || !verified) {
        log("warn", "auth.login_failed", { requestId: context.requestId });
        throw new ApiError(
          401,
          "INVALID_CREDENTIALS",
          "Incorrect email or password.",
        );
      }
      if (user.status !== "active") {
        throw new ApiError(
          403,
          "ACCOUNT_SUSPENDED",
          "This Vault account is suspended.",
        );
      }
      if (needsRehash(credential.passwordHash)) {
        await credentialRepository.replaceHash(db, {
          userId: user.id,
          passwordHash: await hashPassword(input.password),
          changedPassword: false,
        });
      }
      return issueSession(user, context, context.previousToken);
    },

    /**
     * Resolves a cookie token to its user. Returns `undefined` for anything
     * that is not a live session; the reason is logged, never returned, so a
     * caller cannot probe session state.
     */
    async resolveSession(
      token: string,
    ): Promise<{ user: ApplicationUserRow; sessionId: string } | undefined> {
      const session = await sessionRepository.findByTokenHash(
        db,
        hashSessionToken(token),
      );
      if (!session || session.revokedAt) return undefined;
      const now = new Date();
      if (session.expiresAt <= now) return undefined;
      if (
        now.getTime() - session.lastSeenAt.getTime() >
        SESSION_IDLE_TIMEOUT_MS
      )
        return undefined;
      const user = await userRepository.findById(db, session.userId);
      if (!user) return undefined;
      if (
        now.getTime() - session.lastSeenAt.getTime() >
        SESSION_TOUCH_INTERVAL_MS
      )
        await sessionRepository.touch(db, session.id, now);
      return { user, sessionId: session.id };
    },

    async logout(
      token: string | undefined,
      context: RequestContext,
    ): Promise<void> {
      if (!token) return;
      const session = await sessionRepository.findByTokenHash(
        db,
        hashSessionToken(token),
      );
      if (!session || session.revokedAt) return;
      await withTransaction(db, async (tx) => {
        await sessionRepository.revoke(tx, session.id, new Date());
        await appendAuditEvent(tx, {
          actorUserId: session.userId,
          action: "auth.logout",
          entityType: "application_user",
          entityId: session.userId,
          requestId: context.requestId,
        });
      });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

/**
 * Authenticates every API request from the session cookie. Fail closed: no
 * cookie, dead session or inactive user means no `req.localUser`. A suspended
 * user's sessions are revoked when they are suspended, and this check refuses
 * them again on every request in case one survived.
 */
export function createRequireLocalUser(options: {
  auth: AuthService;
  cookiePolicy: CookiePolicy;
}): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = readSessionToken(req);
      const resolved = token
        ? await options.auth.resolveSession(token)
        : undefined;
      if (!resolved) {
        if (token) clearSessionCookie(res, options.cookiePolicy);
        throw new ApiError(401, "UNAUTHENTICATED", "Sign in is required.");
      }
      if (resolved.user.status !== "active") {
        clearSessionCookie(res, options.cookiePolicy);
        throw new ApiError(
          403,
          "ACCOUNT_SUSPENDED",
          "This Vault account is suspended.",
        );
      }
      req.localUser = toLocalUser(resolved.user);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireStudioAdmin: RequestHandler = (req, _res, next) => {
  if (!req.localUser) {
    return next(
      new ApiError(
        500,
        "AUTH_CONTEXT_MISSING",
        "Authentication context is missing.",
      ),
    );
  }
  if (req.localUser.role !== "studio_admin") {
    return next(
      new ApiError(
        403,
        "FORBIDDEN",
        "Studio administrator access is required.",
      ),
    );
  }
  next();
};

export function issueSessionCookie(
  res: Response,
  session: IssuedSession,
  policy: CookiePolicy,
): void {
  setSessionCookie(res, session.token, policy);
}
