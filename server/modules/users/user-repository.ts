import { eq } from "drizzle-orm";
import { applicationUsers, auditEvents } from "@shared/schema";
import { getDatabase } from "../../db/client";

export class UserRepository {
  async findByClerkUserId(clerkUserId: string) {
    const [user] = await getDatabase()
      .select()
      .from(applicationUsers)
      .where(eq(applicationUsers.clerkUserId, clerkUserId))
      .limit(1);
    return user;
  }

  async createBootstrapAdmin(input: {
    clerkUserId: string;
    email: string | null;
    displayName: string | null;
    requestId: string;
  }) {
    return getDatabase().transaction(async (tx) => {
      const [user] = await tx
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
      if (user) {
        await tx.insert(auditEvents).values({
          actorUserId: user.id,
          action: "user.bootstrap_admin_created",
          entityType: "application_user",
          entityId: user.id,
          requestId: input.requestId,
          metadata: { role: "studio_admin" },
        });
      }
      if (user) return user;
      const [existing] = await tx
        .select()
        .from(applicationUsers)
        .where(eq(applicationUsers.clerkUserId, input.clerkUserId))
        .limit(1);
      return existing;
    });
  }
}
