import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  applicationUsers,
  budgetDepartmentDocuments,
  budgetDepartments,
  budgetLineItems,
  budgetVersions,
  budgets,
  type BudgetDepartmentRow,
  type BudgetLineItemRow,
  type BudgetRow,
  type BudgetVersionRow,
} from "@shared/schema";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";
import { createAttachmentRepository } from "../documents/document-attachments";
import type { UserRefColumns } from "../users/user-ref";

export interface BudgetRecord {
  budget: BudgetRow;
  createdBy: UserRefColumns;
}

export interface BudgetVersionRecord {
  version: BudgetVersionRow;
  createdBy: UserRefColumns;
  submittedBy: UserRefColumns | null;
  lockedBy: UserRefColumns | null;
}

/** A department resolved through its version and budget, so project scoping is one lookup. */
export interface DepartmentScope {
  department: BudgetDepartmentRow;
  version: BudgetVersionRow;
  projectId: string;
}

export interface LineItemScope {
  lineItem: BudgetLineItemRow;
  department: BudgetDepartmentRow;
  version: BudgetVersionRow;
  projectId: string;
}

const creator = alias(applicationUsers, "creator");
const submitter = alias(applicationUsers, "submitter");
const locker = alias(applicationUsers, "locker");

function versionsBase(executor: DatabaseExecutor) {
  return executor
    .select({
      version: budgetVersions,
      createdBy: {
        id: creator.id,
        displayName: creator.displayName,
        email: creator.email,
      },
      submittedBy: {
        id: submitter.id,
        displayName: submitter.displayName,
        email: submitter.email,
      },
      lockedBy: {
        id: locker.id,
        displayName: locker.displayName,
        email: locker.email,
      },
    })
    .from(budgetVersions)
    .innerJoin(creator, eq(budgetVersions.createdByUserId, creator.id))
    .leftJoin(submitter, eq(budgetVersions.submittedByUserId, submitter.id))
    .leftJoin(locker, eq(budgetVersions.lockedByUserId, locker.id));
}

/** Persistence for `budgets`: one row per project. */
export const budgetRepository = {
  /** Row lock for the rest of the transaction; version-creating commands serialise on it. */
  async lockRow(
    tx: Transaction,
    budgetId: string,
  ): Promise<BudgetRow | undefined> {
    const [row] = await tx
      .select()
      .from(budgets)
      .where(eq(budgets.id, budgetId))
      .for("update");
    return row;
  },

  async findByProject(
    executor: DatabaseExecutor,
    projectId: string,
  ): Promise<BudgetRecord | undefined> {
    const [row] = await executor
      .select({
        budget: budgets,
        createdBy: {
          id: applicationUsers.id,
          displayName: applicationUsers.displayName,
          email: applicationUsers.email,
        },
      })
      .from(budgets)
      .innerJoin(
        applicationUsers,
        eq(budgets.createdByUserId, applicationUsers.id),
      )
      .where(eq(budgets.projectId, projectId))
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: {
      projectId: string;
      currency: BudgetRow["currency"];
      createdByUserId: string;
    },
  ): Promise<BudgetRow> {
    const [row] = await tx.insert(budgets).values(input).returning();
    return row;
  },
};

/** Persistence for `budget_versions`. Every lookup is scoped through the budget's project. */
export const budgetVersionRepository = {
  async listByBudget(
    executor: DatabaseExecutor,
    budgetId: string,
  ): Promise<BudgetVersionRecord[]> {
    return versionsBase(executor)
      .where(eq(budgetVersions.budgetId, budgetId))
      .orderBy(desc(budgetVersions.versionNumber));
  },

  async findById(
    executor: DatabaseExecutor,
    input: { projectId: string; versionId: string },
  ): Promise<BudgetVersionRecord | undefined> {
    const [row] = await versionsBase(executor)
      .innerJoin(budgets, eq(budgetVersions.budgetId, budgets.id))
      .where(
        and(
          eq(budgetVersions.id, input.versionId),
          eq(budgets.projectId, input.projectId),
        ),
      )
      .limit(1);
    return row;
  },

  /**
   * Takes the version's row lock for the rest of the transaction, so a
   * content edit and a lifecycle command on the same version serialise and
   * the status check that follows cannot be raced.
   */
  async lockRow(
    tx: Transaction,
    versionId: string,
  ): Promise<BudgetVersionRow | undefined> {
    const [row] = await tx
      .select()
      .from(budgetVersions)
      .where(eq(budgetVersions.id, versionId))
      .for("update");
    return row;
  },

  async insert(
    tx: Transaction,
    input: { budgetId: string; versionNumber: number; createdByUserId: string },
  ): Promise<BudgetVersionRow> {
    const [row] = await tx.insert(budgetVersions).values(input).returning();
    return row;
  },

  /** Content changed inside the version: bump `updated_at` without touching the lifecycle version. */
  async touch(tx: Transaction, versionId: string): Promise<void> {
    await tx
      .update(budgetVersions)
      .set({ updatedAt: new Date() })
      .where(eq(budgetVersions.id, versionId));
  },

  async submit(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      submittedByUserId: string;
      at: Date;
    },
  ): Promise<BudgetVersionRow | undefined> {
    const [row] = await tx
      .update(budgetVersions)
      .set({
        status: "awaiting_approval",
        submittedByUserId: input.submittedByUserId,
        submittedAt: input.at,
        version: input.expectedVersion + 1,
        updatedAt: input.at,
      })
      .where(
        and(
          eq(budgetVersions.id, input.id),
          eq(budgetVersions.version, input.expectedVersion),
        ),
      )
      .returning();
    return row;
  },

  async lock(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      lockedByUserId: string;
      at: Date;
    },
  ): Promise<BudgetVersionRow | undefined> {
    const [row] = await tx
      .update(budgetVersions)
      .set({
        status: "locked",
        lockedByUserId: input.lockedByUserId,
        lockedAt: input.at,
        version: input.expectedVersion + 1,
        updatedAt: input.at,
      })
      .where(
        and(
          eq(budgetVersions.id, input.id),
          eq(budgetVersions.version, input.expectedVersion),
        ),
      )
      .returning();
    return row;
  },
};

/** Persistence for departments and their line items within one version. */
export const budgetDepartmentRepository = {
  async listByVersion(
    executor: DatabaseExecutor,
    versionId: string,
  ): Promise<BudgetDepartmentRow[]> {
    return executor
      .select()
      .from(budgetDepartments)
      .where(eq(budgetDepartments.budgetVersionId, versionId))
      .orderBy(asc(budgetDepartments.position), asc(budgetDepartments.id));
  },

  async findScoped(
    executor: DatabaseExecutor,
    input: { projectId: string; departmentId: string },
  ): Promise<DepartmentScope | undefined> {
    const [row] = await executor
      .select({
        department: budgetDepartments,
        version: budgetVersions,
        projectId: budgets.projectId,
      })
      .from(budgetDepartments)
      .innerJoin(
        budgetVersions,
        eq(budgetDepartments.budgetVersionId, budgetVersions.id),
      )
      .innerJoin(budgets, eq(budgetVersions.budgetId, budgets.id))
      .where(
        and(
          eq(budgetDepartments.id, input.departmentId),
          eq(budgets.projectId, input.projectId),
        ),
      )
      .limit(1);
    return row;
  },

  async nextPosition(
    executor: DatabaseExecutor,
    versionId: string,
  ): Promise<number> {
    const [row] = await executor
      .select({
        next: sql<number>`coalesce(max(${budgetDepartments.position}), -1) + 1`,
      })
      .from(budgetDepartments)
      .where(eq(budgetDepartments.budgetVersionId, versionId));
    return Number(row?.next ?? 0);
  },

  async insert(
    tx: Transaction,
    input: { budgetVersionId: string; name: string; position: number },
  ): Promise<BudgetDepartmentRow> {
    const [row] = await tx.insert(budgetDepartments).values(input).returning();
    return row;
  },

  async rename(
    tx: Transaction,
    input: { id: string; expectedVersion: number; name: string },
  ): Promise<BudgetDepartmentRow | undefined> {
    const [row] = await tx
      .update(budgetDepartments)
      .set({
        name: input.name,
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(budgetDepartments.id, input.id),
          eq(budgetDepartments.version, input.expectedVersion),
        ),
      )
      .returning();
    return row;
  },

  /** Hard delete: departments exist only inside a draft, which has no history to keep. */
  /**
   * Physically removes a department of a draft version only. The predicate
   * is state-aware so a locked version's content can never be deleted, even
   * by a future service mistake: the row must belong to a version whose
   * status is still `draft`.
   */
  async delete(tx: Transaction, id: string): Promise<boolean> {
    const rows = await tx
      .delete(budgetDepartments)
      .where(
        and(
          eq(budgetDepartments.id, id),
          inArray(
            budgetDepartments.budgetVersionId,
            tx
              .select({ id: budgetVersions.id })
              .from(budgetVersions)
              .where(eq(budgetVersions.status, "draft")),
          ),
        ),
      )
      .returning({ id: budgetDepartments.id });
    return rows.length > 0;
  },

  async countContents(
    executor: DatabaseExecutor,
    departmentId: string,
  ): Promise<{ lineItems: number; documents: number }> {
    const [items] = await executor
      .select({ n: sql<number>`count(*)::int` })
      .from(budgetLineItems)
      .where(eq(budgetLineItems.budgetDepartmentId, departmentId));
    const [docs] = await executor
      .select({ n: sql<number>`count(*)::int` })
      .from(budgetDepartmentDocuments)
      .where(eq(budgetDepartmentDocuments.budgetDepartmentId, departmentId));
    return {
      lineItems: Number(items?.n ?? 0),
      documents: Number(docs?.n ?? 0),
    };
  },
};

/**
 * Exact numeric(14,2) sums computed by PostgreSQL, keyed by the grouping id
 * and rendered as text so no floating point is ever involved. Ids without
 * line items are absent from the map; callers treat that as "0.00".
 */
async function sumsBy(
  executor: DatabaseExecutor,
  group: "department" | "version",
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const key =
    group === "department"
      ? budgetLineItems.budgetDepartmentId
      : budgetDepartments.budgetVersionId;
  const query = executor
    .select({
      id: key,
      total: sql<string>`sum(${budgetLineItems.amount})::text`,
    })
    .from(budgetLineItems)
    .innerJoin(
      budgetDepartments,
      eq(budgetLineItems.budgetDepartmentId, budgetDepartments.id),
    )
    .where(inArray(key, ids))
    .groupBy(key);
  return new Map((await query).map((row) => [row.id, row.total]));
}

export const budgetLineItemRepository = {
  /** Sum of each department's line items. */
  totalsByDepartment: (executor: DatabaseExecutor, departmentIds: string[]) =>
    sumsBy(executor, "department", departmentIds),

  /** Sum of every line item in each version. */
  totalsByVersion: (executor: DatabaseExecutor, versionIds: string[]) =>
    sumsBy(executor, "version", versionIds),

  async listByDepartments(
    executor: DatabaseExecutor,
    departmentIds: string[],
  ): Promise<BudgetLineItemRow[]> {
    if (departmentIds.length === 0) return [];
    return executor
      .select()
      .from(budgetLineItems)
      .where(inArray(budgetLineItems.budgetDepartmentId, departmentIds))
      .orderBy(asc(budgetLineItems.position), asc(budgetLineItems.id));
  },

  async findScoped(
    executor: DatabaseExecutor,
    input: { projectId: string; lineItemId: string },
  ): Promise<LineItemScope | undefined> {
    const [row] = await executor
      .select({
        lineItem: budgetLineItems,
        department: budgetDepartments,
        version: budgetVersions,
        projectId: budgets.projectId,
      })
      .from(budgetLineItems)
      .innerJoin(
        budgetDepartments,
        eq(budgetLineItems.budgetDepartmentId, budgetDepartments.id),
      )
      .innerJoin(
        budgetVersions,
        eq(budgetDepartments.budgetVersionId, budgetVersions.id),
      )
      .innerJoin(budgets, eq(budgetVersions.budgetId, budgets.id))
      .where(
        and(
          eq(budgetLineItems.id, input.lineItemId),
          eq(budgets.projectId, input.projectId),
        ),
      )
      .limit(1);
    return row;
  },

  async nextPosition(
    executor: DatabaseExecutor,
    departmentId: string,
  ): Promise<number> {
    const [row] = await executor
      .select({
        next: sql<number>`coalesce(max(${budgetLineItems.position}), -1) + 1`,
      })
      .from(budgetLineItems)
      .where(eq(budgetLineItems.budgetDepartmentId, departmentId));
    return Number(row?.next ?? 0);
  },

  async insert(
    tx: Transaction,
    input: {
      budgetDepartmentId: string;
      name: string;
      amount: string;
      note: string | null;
      position: number;
    },
  ): Promise<BudgetLineItemRow> {
    const [row] = await tx.insert(budgetLineItems).values(input).returning();
    return row;
  },

  async update(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      values: Partial<Pick<BudgetLineItemRow, "name" | "amount" | "note">>;
    },
  ): Promise<BudgetLineItemRow | undefined> {
    const [row] = await tx
      .update(budgetLineItems)
      .set({
        ...input.values,
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(budgetLineItems.id, input.id),
          eq(budgetLineItems.version, input.expectedVersion),
        ),
      )
      .returning();
    return row;
  },

  /** Hard delete: a line item exists only inside a draft. */
  async delete(
    tx: Transaction,
    input: { id: string; expectedVersion: number },
  ): Promise<boolean> {
    const rows = await tx
      .delete(budgetLineItems)
      .where(
        and(
          eq(budgetLineItems.id, input.id),
          // Draft versions only; locked history is never physically deleted.
          inArray(
            budgetLineItems.budgetDepartmentId,
            tx
              .select({ id: budgetDepartments.id })
              .from(budgetDepartments)
              .innerJoin(
                budgetVersions,
                eq(budgetDepartments.budgetVersionId, budgetVersions.id),
              )
              .where(eq(budgetVersions.status, "draft")),
          ),
          eq(budgetLineItems.version, input.expectedVersion),
        ),
      )
      .returning({ id: budgetLineItems.id });
    return rows.length > 0;
  },
};

/** Persistence for the department→document lineage join (shared owner pattern). */
export const budgetDepartmentDocumentRepository = createAttachmentRepository({
  table: budgetDepartmentDocuments,
  ownerColumn: budgetDepartmentDocuments.budgetDepartmentId,
  ownerKey: "budgetDepartmentId",
});
