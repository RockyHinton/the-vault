import type { ProvisionUserInput, VaultUser } from "@shared/contracts";
import type { ApplicationUserRow } from "@shared/schema";
import type { Database } from "../../db/client";
import { withTransaction, type Transaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { isUniqueViolation } from "../../db/unique-violation";
import { appendAuditEvent } from "../audit/audit-repository";
import { credentialRepository } from "../auth/credential-repository";
import { hashPassword } from "../auth/password-hashing";
import { sessionRepository } from "../auth/session-repository";
import { toUserRef } from "./user-ref";
import { userRepository, type ApplicationRole } from "./user-repository";

export interface Actor {
  userId: string;
  requestId: string;
}

export function toVaultUser(row: ApplicationUserRow): VaultUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function requireUser(row: ApplicationUserRow | undefined): ApplicationUserRow {
  if (!row)
    throw new ApiError(404, "USER_NOT_FOUND", "The user was not found.");
  return row;
}

function requireFresh(row: ApplicationUserRow | undefined): ApplicationUserRow {
  if (!row)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "This user changed while you were editing. Refresh and try again.",
    );
  return row;
}

/**
 * Users & Access use-cases. Administrative commands only; every command is
 * studio_admin-guarded at the route, audited in the same transaction, and
 * protected against leaving the deployment without a usable administrator.
 */
export function createUserService({ db }: { db: Database }) {
  /**
   * The deployment must always keep at least one active studio_admin. Every
   * command that can remove an active admin (demotion, suspension) calls this
   * before its compare-and-set write. The active admins are row-locked, so
   * concurrent removals serialise instead of both counting "two admins" and
   * both proceeding. The lock is held until the command's transaction ends.
   */
  async function assertNotLastActiveAdmin(
    tx: Transaction,
    target: ApplicationUserRow,
  ) {
    if (target.role !== "studio_admin" || target.status !== "active") return;
    const activeAdminIds = await userRepository.lockActiveAdmins(tx);
    if (activeAdminIds.filter((id) => id !== target.id).length === 0) {
      throw new ApiError(
        409,
        "LAST_ADMIN_PROTECTED",
        "This is the only active studio administrator. Promote another user first.",
      );
    }
  }

  return {
    /** Safe references to every active user; readable by any active user. */
    async directory() {
      return (await userRepository.listActive(db)).map(toUserRef);
    },

    async list(input: { status: "active" | "suspended" | "all" }) {
      const rows = await userRepository.list(db, input);
      return rows.map(toVaultUser);
    },

    /**
     * Closed-access provisioning: the administrator supplies email, name,
     * initial password and role. The password is hashed before the
     * transaction and only the hash is written, together with the user row
     * and the audit event.
     */
    async provision(
      input: ProvisionUserInput,
      actor: Actor,
    ): Promise<VaultUser> {
      if (await userRepository.findByEmail(db, input.email)) {
        throw new ApiError(
          409,
          "USER_EXISTS",
          "A Vault user with this email address already exists.",
        );
      }
      const passwordHash = await hashPassword(input.password);
      try {
        const row = await withTransaction(db, async (tx) => {
          const created = await userRepository.insert(tx, {
            email: input.email,
            displayName: input.displayName,
            role: input.role,
          });
          await credentialRepository.insert(tx, {
            userId: created.id,
            passwordHash,
          });
          await appendAuditEvent(tx, {
            actorUserId: actor.userId,
            action: "user.provisioned",
            entityType: "application_user",
            entityId: created.id,
            requestId: actor.requestId,
            metadata: { role: input.role },
          });
          return created;
        });
        return toVaultUser(row);
      } catch (error) {
        if (isUniqueViolation(error, "application_users_email_lower_unique")) {
          throw new ApiError(
            409,
            "USER_EXISTS",
            "A Vault user with this email address already exists.",
          );
        }
        throw error;
      }
    },

    async changeRole(
      id: string,
      input: { role: ApplicationRole; version: number },
      actor: Actor,
    ): Promise<VaultUser> {
      const row = await withTransaction(db, async (tx) => {
        const existing = requireUser(await userRepository.findById(tx, id));
        if (existing.role === input.role) {
          throw new ApiError(
            409,
            "ROLE_UNCHANGED",
            "The user already has this role.",
          );
        }
        if (input.role === "user") {
          if (existing.id === actor.userId) {
            throw new ApiError(
              409,
              "SELF_DEMOTION_BLOCKED",
              "You cannot remove your own administrator role.",
            );
          }
          await assertNotLastActiveAdmin(tx, existing);
        }
        const updated = requireFresh(
          await userRepository.changeRole(tx, {
            id,
            expectedVersion: input.version,
            role: input.role,
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "user.role_changed",
          entityType: "application_user",
          entityId: updated.id,
          requestId: actor.requestId,
          metadata: { fromRole: existing.role, toRole: input.role },
        });
        return updated;
      });
      return toVaultUser(row);
    },

    /** Suspension also revokes every live session, in the same transaction. */
    async suspend(
      id: string,
      version: number,
      actor: Actor,
    ): Promise<VaultUser> {
      const row = await withTransaction(db, async (tx) => {
        const existing = requireUser(await userRepository.findById(tx, id));
        if (existing.status === "suspended") {
          throw new ApiError(
            409,
            "USER_ALREADY_SUSPENDED",
            "This user is already suspended.",
          );
        }
        if (existing.id === actor.userId) {
          throw new ApiError(
            409,
            "SELF_SUSPENSION_BLOCKED",
            "You cannot suspend your own account.",
          );
        }
        await assertNotLastActiveAdmin(tx, existing);
        const updated = requireFresh(
          await userRepository.changeStatus(tx, {
            id,
            expectedVersion: version,
            status: "suspended",
          }),
        );
        const sessionsRevoked = await sessionRepository.revokeAllForUser(
          tx,
          updated.id,
          new Date(),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "user.suspended",
          entityType: "application_user",
          entityId: updated.id,
          requestId: actor.requestId,
          metadata: { sessionsRevoked },
        });
        return updated;
      });
      return toVaultUser(row);
    },

    async reinstate(
      id: string,
      version: number,
      actor: Actor,
    ): Promise<VaultUser> {
      const row = await withTransaction(db, async (tx) => {
        const existing = requireUser(await userRepository.findById(tx, id));
        if (existing.status === "active") {
          throw new ApiError(
            409,
            "USER_NOT_SUSPENDED",
            "This user is not suspended.",
          );
        }
        const updated = requireFresh(
          await userRepository.changeStatus(tx, {
            id,
            expectedVersion: version,
            status: "active",
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "user.reinstated",
          entityType: "application_user",
          entityId: updated.id,
          requestId: actor.requestId,
        });
        return updated;
      });
      return toVaultUser(row);
    },
  };
}

export type UserService = ReturnType<typeof createUserService>;
