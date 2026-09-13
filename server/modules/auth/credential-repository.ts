import { eq } from "drizzle-orm";
import { userCredentials, type UserCredentialRow } from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";

/** Persistence for `user_credentials`. Only hashed values ever pass through here. */
export const credentialRepository = {
  async findByUserId(
    executor: DatabaseExecutor,
    userId: string,
  ): Promise<UserCredentialRow | undefined> {
    const [row] = await executor
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.userId, userId))
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: { userId: string; passwordHash: string },
  ): Promise<void> {
    await tx.insert(userCredentials).values(input);
  },

  async replaceHash(
    executor: DatabaseExecutor,
    input: { userId: string; passwordHash: string; changedPassword: boolean },
  ): Promise<void> {
    await executor
      .update(userCredentials)
      .set({
        passwordHash: input.passwordHash,
        updatedAt: new Date(),
        ...(input.changedPassword ? { passwordChangedAt: new Date() } : {}),
      })
      .where(eq(userCredentials.userId, input.userId));
  },
};
