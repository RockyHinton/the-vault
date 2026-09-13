import { and, asc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  applicationUsers,
  budgetVersions,
  budgets,
  financePlans,
  financeSourceDocuments,
  financeSources,
  type FinancePlanRow,
  type FinanceSourceRow,
} from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";
import { createAttachmentRepository } from "../documents/document-attachments";
import type { UserRefColumns } from "../users/user-ref";

export interface FinancePlanRecord {
  plan: FinancePlanRow;
  createdBy: UserRefColumns;
  /** Resolved through the referenced budget version so every read carries the baseline. */
  budgetVersionNumber: number;
  currency: "GBP" | "USD" | "EUR";
}

export interface FinanceSourceRecord {
  source: FinanceSourceRow;
  createdBy: UserRefColumns;
  approvedBy: UserRefColumns | null;
}

/** Only what an edit may change; status and approval move through commands. */
export type FinanceSourceEditableFields = Partial<
  Pick<FinanceSourceRow, "name" | "type" | "amount" | "expectedDate" | "notes">
>;

const creator = alias(applicationUsers, "creator");
const approver = alias(applicationUsers, "approver");

function plansBase(executor: DatabaseExecutor) {
  return executor
    .select({
      plan: financePlans,
      createdBy: {
        id: applicationUsers.id,
        displayName: applicationUsers.displayName,
        email: applicationUsers.email,
      },
      budgetVersionNumber: budgetVersions.versionNumber,
      currency: budgets.currency,
    })
    .from(financePlans)
    .innerJoin(
      applicationUsers,
      eq(financePlans.createdByUserId, applicationUsers.id),
    )
    .innerJoin(
      budgetVersions,
      eq(financePlans.budgetVersionId, budgetVersions.id),
    )
    .innerJoin(budgets, eq(budgetVersions.budgetId, budgets.id));
}

/** Persistence for `finance_plans`: one row per project. */
export const financePlanRepository = {
  async findByProject(
    executor: DatabaseExecutor,
    projectId: string,
  ): Promise<FinancePlanRecord | undefined> {
    const [row] = await plansBase(executor)
      .where(eq(financePlans.projectId, projectId))
      .limit(1);
    return row;
  },

  /** Row lock for the rest of the transaction, so source commands and a rebase serialise. */
  async lockRow(
    tx: Transaction,
    planId: string,
  ): Promise<FinancePlanRow | undefined> {
    const [row] = await tx
      .select()
      .from(financePlans)
      .where(eq(financePlans.id, planId))
      .for("update");
    return row;
  },

  async insert(
    tx: Transaction,
    input: {
      projectId: string;
      budgetVersionId: string;
      createdByUserId: string;
    },
  ): Promise<FinancePlanRow> {
    const [row] = await tx.insert(financePlans).values(input).returning();
    return row;
  },

  async rebase(
    tx: Transaction,
    input: { id: string; expectedVersion: number; budgetVersionId: string },
  ): Promise<FinancePlanRow | undefined> {
    const [row] = await tx
      .update(financePlans)
      .set({
        budgetVersionId: input.budgetVersionId,
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financePlans.id, input.id),
          eq(financePlans.version, input.expectedVersion),
        ),
      )
      .returning();
    return row;
  },

  async touch(tx: Transaction, id: string): Promise<void> {
    await tx
      .update(financePlans)
      .set({ updatedAt: new Date() })
      .where(eq(financePlans.id, id));
  },
};

function sourcesBase(executor: DatabaseExecutor) {
  return executor
    .select({
      source: financeSources,
      createdBy: {
        id: creator.id,
        displayName: creator.displayName,
        email: creator.email,
      },
      approvedBy: {
        id: approver.id,
        displayName: approver.displayName,
        email: approver.email,
      },
    })
    .from(financeSources)
    .innerJoin(creator, eq(financeSources.createdByUserId, creator.id))
    .leftJoin(approver, eq(financeSources.approvedByUserId, approver.id));
}

async function updateIfVersionMatches(
  tx: Transaction,
  input: {
    id: string;
    expectedVersion: number;
    set: FinanceSourceEditableFields &
      Partial<
        Pick<FinanceSourceRow, "status" | "approvedByUserId" | "approvedAt">
      >;
  },
): Promise<FinanceSourceRow | undefined> {
  const [row] = await tx
    .update(financeSources)
    .set({
      ...input.set,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financeSources.id, input.id),
        eq(financeSources.version, input.expectedVersion),
      ),
    )
    .returning();
  return row;
}

/** Persistence for `finance_sources`; scoped lookups join back to the plan's project. */
export const financeSourceRepository = {
  async listByPlan(
    executor: DatabaseExecutor,
    planId: string,
  ): Promise<FinanceSourceRecord[]> {
    return sourcesBase(executor)
      .where(eq(financeSources.financePlanId, planId))
      .orderBy(asc(financeSources.position), asc(financeSources.id));
  },

  async findScoped(
    executor: DatabaseExecutor,
    input: { projectId: string; sourceId: string },
  ): Promise<(FinanceSourceRecord & { projectId: string }) | undefined> {
    const [row] = await sourcesBase(executor)
      .innerJoin(
        financePlans,
        eq(financeSources.financePlanId, financePlans.id),
      )
      .where(
        and(
          eq(financeSources.id, input.sourceId),
          eq(financePlans.projectId, input.projectId),
        ),
      )
      .limit(1);
    return row ? { ...row, projectId: input.projectId } : undefined;
  },

  async nextPosition(
    executor: DatabaseExecutor,
    planId: string,
  ): Promise<number> {
    const [row] = await executor
      .select({
        next: sql<number>`coalesce(max(${financeSources.position}), -1) + 1`,
      })
      .from(financeSources)
      .where(eq(financeSources.financePlanId, planId));
    return Number(row?.next ?? 0);
  },

  async insert(
    tx: Transaction,
    input: {
      financePlanId: string;
      name: string;
      type: FinanceSourceRow["type"];
      amount: string;
      status: "targeted" | "soft_committed";
      expectedDate: string | null;
      notes: string | null;
      position: number;
      createdByUserId: string;
    },
  ): Promise<FinanceSourceRow> {
    const [row] = await tx.insert(financeSources).values(input).returning();
    return row;
  },

  updateFields(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      values: FinanceSourceEditableFields;
    },
  ): Promise<FinanceSourceRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: input.values,
    });
  },

  changeStatus(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      status: "targeted" | "soft_committed";
    },
  ): Promise<FinanceSourceRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { status: input.status },
    });
  },

  approve(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      approvedByUserId: string;
      at: Date;
    },
  ): Promise<FinanceSourceRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: {
        status: "approved",
        approvedByUserId: input.approvedByUserId,
        approvedAt: input.at,
      },
    });
  },

  /**
   * Hard delete of an unapproved source. The predicate is state-aware so an
   * approved source, an immutable financial fact, can never be physically
   * deleted even by a future service mistake.
   */
  async delete(
    tx: Transaction,
    input: { id: string; expectedVersion: number },
  ): Promise<boolean> {
    const rows = await tx
      .delete(financeSources)
      .where(
        and(
          eq(financeSources.id, input.id),
          eq(financeSources.version, input.expectedVersion),
          ne(financeSources.status, "approved"),
        ),
      )
      .returning({ id: financeSources.id });
    return rows.length > 0;
  },
};

/** Persistence for the source→document lineage join (shared owner pattern). */
export const financeSourceDocumentRepository = createAttachmentRepository({
  table: financeSourceDocuments,
  ownerColumn: financeSourceDocuments.financeSourceId,
  ownerKey: "financeSourceId",
});
