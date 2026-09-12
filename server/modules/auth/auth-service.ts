import { getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";
import type { ApplicationUserRow } from "@shared/schema";
import type { Database } from "../../db/client";
import { withTransaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { log } from "../../observability/logger";
import { appendAuditEvent } from "../audit/audit-repository";
import { userRepository } from "../users/user-repository";
import { fetchClerkProfile, type ProfileLookup } from "./clerk-profile";

/** Identity proven by Clerk (or, in tests only, injected through the seam). */
export interface VerifiedIdentity {
  clerkUserId: string;
  email: string | null;
  displayName: string | null;
}

export type IdentityResolver = (
  request: Request,
) => VerifiedIdentity | undefined;

export interface LocalUserGuardOptions {
  db: Database;
  /**
   * Exact Clerk user ID allowed to self-provision the first studio_admin.
   * Comes from VAULT_BOOTSTRAP_ADMIN_CLERK_ID; remove it after bootstrap.
   */
  bootstrapAdminClerkId?: string;
  /** Test-only seam. The composition root refuses it outside NODE_ENV=test. */
  identityResolver?: IdentityResolver;
  /** Source of email/display name when creating the bootstrap account. */
  profileLookup?: ProfileLookup;
}

export type LocalUser = NonNullable<Request["localUser"]>;

function toLocalUser(user: ApplicationUserRow): LocalUser {
  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
  };
}

/**
 * One-time operator bootstrap. Exact Clerk ID match only; idempotent through
 * the unique index on clerk_user_id; audited in the same transaction.
 */
async function bootstrapStudioAdmin(input: {
  db: Database;
  clerkUserId: string;
  email: string | null;
  displayName: string | null;
  requestId: string;
}): Promise<ApplicationUserRow | undefined> {
  return withTransaction(input.db, async (tx) => {
    const inserted = await userRepository.insertStudioAdminIfAbsent(tx, {
      clerkUserId: input.clerkUserId,
      email: input.email,
      displayName: input.displayName,
    });
    if (!inserted)
      return userRepository.findByClerkUserId(tx, input.clerkUserId);
    await appendAuditEvent(tx, {
      actorUserId: inserted.id,
      action: "user.bootstrap_admin_created",
      entityType: "application_user",
      entityId: inserted.id,
      requestId: input.requestId,
      metadata: {
        role: "studio_admin",
        source: "VAULT_BOOTSTRAP_ADMIN_CLERK_ID",
      },
    });
    log("info", "auth.bootstrap_admin_created", {
      requestId: input.requestId,
      applicationUserId: inserted.id,
    });
    return inserted;
  });
}

/**
 * Resolves the Clerk-verified identity to a local `application_users` row.
 * Signing in with Clerk never grants access by itself: only an active local
 * account proceeds. Unknown users receive their own Clerk user ID back so an
 * operator can provision them (or bootstrap the first admin).
 */
export function createRequireLocalUser(
  options: LocalUserGuardOptions,
): RequestHandler {
  const profileLookup = options.profileLookup ?? fetchClerkProfile;
  return async (req, _res, next) => {
    try {
      const injected = options.identityResolver?.(req);
      const clerkUserId = injected?.clerkUserId ?? getAuth(req).userId;
      if (!clerkUserId)
        throw new ApiError(401, "UNAUTHENTICATED", "Sign in is required.");

      let user = await userRepository.findByClerkUserId(
        options.db,
        clerkUserId,
      );
      if (!user && options.bootstrapAdminClerkId === clerkUserId) {
        // The test seam may carry a profile; a real Clerk session does not,
        // so ask the Clerk backend API for email and name (once, at bootstrap).
        const profile =
          injected && (injected.email || injected.displayName)
            ? injected
            : await profileLookup(clerkUserId);
        user = await bootstrapStudioAdmin({
          db: options.db,
          clerkUserId,
          email: profile.email,
          displayName: profile.displayName,
          requestId: req.requestId,
        });
      }

      if (!user) {
        throw new ApiError(
          403,
          "LOCAL_ACCESS_REQUIRED",
          "This account has not been granted access to this Vault instance.",
          { clerkUserId },
        );
      }
      if (user.status !== "active") {
        throw new ApiError(
          403,
          "ACCOUNT_SUSPENDED",
          "This Vault account is suspended.",
        );
      }

      req.localUser = toLocalUser(user);
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
