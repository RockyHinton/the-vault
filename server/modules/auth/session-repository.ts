import { and, eq, isNull } from "drizzle-orm";
import { authSessions, type AuthSessionRow } from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";

/** Persistence for `auth_sessions`. Expiry and revocation policy live in the service. */
export const sessionRepository = {
  async insert(
    tx: Transaction,
    input: { userId: string; tokenHash: string; expiresAt: Date },
  ): Promise<AuthSessionRow> {
    const [row] = await tx.insert(authSessions).values(input).returning();
    return row;
  },

  async findByTokenHash(
    executor: DatabaseExecutor,
    tokenHash: string,
  ): Promise<AuthSessionRow | undefined> {
    const [row] = await executor
      .select()
      .from(authSessions)
      .where(eq(authSessions.tokenHash, tokenHash))
      .limit(1);
    return row;
  },

  async touch(
    executor: DatabaseExecutor,
    id: string,
    lastSeenAt: Date,
  ): Promise<void> {
    await executor
      .update(authSessions)
      .set({ lastSeenAt })
      .where(eq(authSessions.id, id));
  },

  /** Idempotent: revoking an already revoked session keeps the first timestamp. */
  async revoke(
    executor: DatabaseExecutor,
    id: string,
    revokedAt: Date,
  ): Promise<void> {
    await executor
      .update(authSessions)
      .set({ revokedAt })
      .where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)));
  },

  /** Returns how many live sessions were revoked. */
  async revokeAllForUser(
    executor: DatabaseExecutor,
    userId: string,
    revokedAt: Date,
  ): Promise<number> {
    const rows = await executor
      .update(authSessions)
      .set({ revokedAt })
      .where(
        and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)),
      )
      .returning({ id: authSessions.id });
    return rows.length;
  },
};
