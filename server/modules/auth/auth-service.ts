import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { ApiError } from "../../http/errors";
import { readEnvironment } from "../../config/env";
import { UserRepository } from "../users/user-repository";

const users = new UserRepository();
export interface VerifiedIdentity {
  clerkUserId: string;
  email: string | null;
  displayName: string | null;
}

type IdentityResolver = (
  request: Parameters<RequestHandler>[0],
) => VerifiedIdentity | undefined;

function localUserShape(
  user: NonNullable<Awaited<ReturnType<UserRepository["findByClerkUserId"]>>>,
) {
  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
  };
}

export function createRequireLocalUser(
  identityResolver?: IdentityResolver,
): RequestHandler {
  return async (req, _res, next) => {
    try {
      const resolvedIdentity = identityResolver?.(req);
      const auth = resolvedIdentity ? undefined : getAuth(req);
      const candidateUserId =
        resolvedIdentity?.clerkUserId ??
        auth?.sessionClaims?.userId ??
        auth?.userId;
      if (typeof candidateUserId !== "string")
        throw new ApiError(401, "UNAUTHENTICATED", "Sign in is required.");
      const clerkUserId = candidateUserId;

      let user = await users.findByClerkUserId(clerkUserId);
      const bootstrapId = readEnvironment().VAULT_BOOTSTRAP_ADMIN_CLERK_ID;
      if (!user && bootstrapId === clerkUserId) {
        const claims = (auth?.sessionClaims ?? {}) as Record<string, unknown>;
        const email =
          resolvedIdentity?.email ??
          (typeof claims.email === "string" ? claims.email : null);
        const displayName =
          resolvedIdentity?.displayName ??
          (typeof claims.fullName === "string"
            ? claims.fullName
            : typeof claims.firstName === "string"
              ? claims.firstName
              : null);
        user = await users.createBootstrapAdmin({
          clerkUserId,
          email,
          displayName,
          requestId: req.requestId,
        });
      }

      if (!user) {
        throw new ApiError(
          403,
          "LOCAL_ACCESS_REQUIRED",
          "This account has not been granted access to this Vault instance.",
        );
      }
      if (user.status !== "active") {
        throw new ApiError(
          403,
          "ACCOUNT_SUSPENDED",
          "This Vault account is suspended.",
        );
      }

      req.localUser = localUserShape(user);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireLocalUser = createRequireLocalUser();

export const requireStudioAdmin: RequestHandler = (req, _res, next) => {
  if (!req.localUser)
    return next(
      new ApiError(
        500,
        "AUTH_CONTEXT_MISSING",
        "Authentication context is missing.",
      ),
    );
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
