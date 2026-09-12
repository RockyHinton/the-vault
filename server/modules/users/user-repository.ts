import { eq } from "drizzle-orm";
import { applicationUsers, type ApplicationUserRow } from "@shared/schema";
import type { DatabaseExecutor } from "../../db/transaction";

/**
 * Persistence for `application_users`. Functions take the executor they run
 * against; callers that need atomicity pass an open transaction.
 */
export const userRepository = {
  async findByClerkUserId(
    executor: DatabaseExecutor,
    clerkUserId: string,
  ): Promise<ApplicationUserRow | undefined> {
    const [user] = await executor
      .select()
      .from(applicationUsers)
      .where(eq(applicationUsers.clerkUserId, clerkUserId))
      .limit(1);
    return user;
  },

  /**
   * Inserts an active studio admin unless the Clerk user already has a local
   * account. Returns the inserted row, or undefined when it already existed.
   */
  async insertStudioAdminIfAbsent(
    executor: DatabaseExecutor,
    input: {
      clerkUserId: string;
      email: string | null;
      displayName: string | null;
    },
  ): Promise<ApplicationUserRow | undefined> {
    const [user] = await executor
      .insert(applicationUsers)
      .values({
        clerkUserId: input.clerkUserId,
        email: input.email,
        displayName: input.displayName,
        role: "studio_admin",
        status: "active",
      })
      .onConflictDoNothing({ target: applicationUsers.clerkUserId })
      .returning();
    return user;
  },
};
