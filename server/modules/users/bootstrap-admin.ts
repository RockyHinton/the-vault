import type { Database } from "../../db/client";
import { withTransaction } from "../../db/transaction";
import { appendAuditEvent } from "../audit/audit-repository";
import { credentialRepository } from "../auth/credential-repository";
import { hashPassword } from "../auth/password-hashing";
import { userRepository } from "./user-repository";

export interface BootstrapAdminInput {
  email: string;
  /** Hashed before anything is written; never stored or logged in plain text. */
  password: string;
  displayName: string;
  requestId: string;
}

export type BootstrapAdminResult =
  | { outcome: "already_bootstrapped"; userId: string }
  | { outcome: "created"; userId: string };

export class BootstrapRefusedError extends Error {}

/**
 * Explicit, operator-run, one-time bootstrap of the first studio_admin.
 *
 * - Never runs on a web request; only the `bootstrap:admin` script calls it.
 * - Idempotent: an existing active studio_admin for the email is a no-op,
 *   and its password is left exactly as it is.
 * - Never overwrites: an existing Vault user with another role or status is
 *   refused so the operator uses the normal admin commands instead.
 * - The user row, the credential and the audit event commit together.
 */
export async function bootstrapStudioAdmin(
  deps: { db: Database },
  input: BootstrapAdminInput,
): Promise<BootstrapAdminResult> {
  const email = input.email.trim().toLowerCase();
  const existing = await userRepository.findByEmail(deps.db, email);
  if (existing) {
    if (existing.role === "studio_admin" && existing.status === "active") {
      return { outcome: "already_bootstrapped", userId: existing.id };
    }
    throw new BootstrapRefusedError(
      `A Vault user already exists for ${email} with role "${existing.role}" and status "${existing.status}". Bootstrap will not change it; use the administrator commands.`,
    );
  }

  const passwordHash = await hashPassword(input.password);
  const created = await withTransaction(deps.db, async (tx) => {
    const row = await userRepository.insert(tx, {
      email,
      displayName: input.displayName,
      role: "studio_admin",
    });
    await credentialRepository.insert(tx, { userId: row.id, passwordHash });
    await appendAuditEvent(tx, {
      actorUserId: row.id,
      action: "user.bootstrap_admin_created",
      entityType: "application_user",
      entityId: row.id,
      requestId: input.requestId,
      metadata: { role: "studio_admin", source: "bootstrap:admin" },
    });
    return row;
  });

  return { outcome: "created", userId: created.id };
}
