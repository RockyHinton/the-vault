import { and, asc, count, eq, sql } from "drizzle-orm";
import { applicationUsers, type ApplicationUserRow } from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";

export type ApplicationRole = ApplicationUserRow["role"];
export type UserStatus = ApplicationUserRow["status"];

/** Only what an insert may set. Credentials live in `user_credentials`. */
export interface NewApplicationUser {
  email: string;
  displayName: string | null;
  role: ApplicationRole;
}

/**
 * Compare-and-set on id + expected version. Zero rows means the caller is
 * stale. Only role and status are ever changed after creation.
 */
async function updateIfVersionMatches(
  tx: Transaction,
  input: {
    id: string;
    expectedVersion: number;
    set: Partial<Pick<ApplicationUserRow, "role" | "status">>;
  },
): Promise<ApplicationUserRow | undefined> {
  const [row] = await tx
    .update(applicationUsers)
    .set({
      ...input.set,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(applicationUsers.id, input.id),
        eq(applicationUsers.version, input.expectedVersion),
      ),
    )
    .returning();
  return row;
}

/**
 * Persistence for `application_users`. Functions take the executor they run
 * against; callers that need atomicity pass an open transaction.
 */
export const userRepository = {
  async list(
    executor: DatabaseExecutor,
    input: { status: "active" | "suspended" | "all" },
  ): Promise<ApplicationUserRow[]> {
    return executor
      .select()
      .from(applicationUsers)
      .where(
        input.status === "all"
          ? undefined
          : eq(applicationUsers.status, input.status),
      )
      .orderBy(asc(applicationUsers.createdAt), asc(applicationUsers.id));
  },

  async findById(
    executor: DatabaseExecutor,
    id: string,
  ): Promise<ApplicationUserRow | undefined> {
    const [row] = await executor
      .select()
      .from(applicationUsers)
      .where(eq(applicationUsers.id, id))
      .limit(1);
    return row;
  },

  /** Case-insensitive; the unique index is on lower(email). */
  async findByEmail(
    executor: DatabaseExecutor,
    email: string,
  ): Promise<ApplicationUserRow | undefined> {
    const [row] = await executor
      .select()
      .from(applicationUsers)
      .where(sql`lower(${applicationUsers.email}) = lower(${email})`)
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: NewApplicationUser,
  ): Promise<ApplicationUserRow> {
    const [row] = await tx
      .insert(applicationUsers)
      .values({ ...input, status: "active" })
      .returning();
    return row;
  },

  async countActiveAdmins(executor: DatabaseExecutor): Promise<number> {
    const [row] = await executor
      .select({ value: count() })
      .from(applicationUsers)
      .where(
        and(
          eq(applicationUsers.role, "studio_admin"),
          eq(applicationUsers.status, "active"),
        ),
      );
    return row?.value ?? 0;
  },

  changeRole(
    tx: Transaction,
    input: { id: string; expectedVersion: number; role: ApplicationRole },
  ): Promise<ApplicationUserRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { role: input.role },
    });
  },

  changeStatus(
    tx: Transaction,
    input: { id: string; expectedVersion: number; status: UserStatus },
  ): Promise<ApplicationUserRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { status: input.status },
    });
  },
};
