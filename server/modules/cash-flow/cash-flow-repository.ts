import { and, asc, eq } from "drizzle-orm";
import {
  applicationUsers,
  cashFlowDepartmentWindows,
  cashFlowPayments,
  cashFlowSourceTimings,
  cashFlows,
  type CashFlowDepartmentWindowRow,
  type CashFlowPaymentRow,
  type CashFlowRow,
  type CashFlowSourceTimingRow,
} from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";
import type { UserRefColumns } from "../users/user-ref";

export interface CashFlowRecord {
  cashFlow: CashFlowRow;
  createdBy: UserRefColumns;
}

export interface CashFlowPaymentRecord {
  payment: CashFlowPaymentRow;
  createdBy: UserRefColumns;
}

/** Only what an edit may change on a payment. */
export type CashFlowPaymentEditableFields = Partial<
  Pick<
    CashFlowPaymentRow,
    "budgetDepartmentId" | "name" | "amount" | "direction" | "date" | "note"
  >
>;

const userColumns = {
  id: applicationUsers.id,
  displayName: applicationUsers.displayName,
  email: applicationUsers.email,
};

/** Persistence for `cash_flows`: one row per project holding authored, non-derived fields. */
export const cashFlowRepository = {
  async findByProject(
    executor: DatabaseExecutor,
    projectId: string,
  ): Promise<CashFlowRecord | undefined> {
    const [row] = await executor
      .select({ cashFlow: cashFlows, createdBy: userColumns })
      .from(cashFlows)
      .innerJoin(
        applicationUsers,
        eq(cashFlows.createdByUserId, applicationUsers.id),
      )
      .where(eq(cashFlows.projectId, projectId))
      .limit(1);
    return row;
  },

  /** Row lock for the rest of the transaction; upserts of child rows serialise on it. */
  async lockRow(tx: Transaction, id: string): Promise<CashFlowRow | undefined> {
    const [row] = await tx
      .select()
      .from(cashFlows)
      .where(eq(cashFlows.id, id))
      .for("update");
    return row;
  },

  async insert(
    tx: Transaction,
    input: {
      projectId: string;
      financePlanId: string;
      createdByUserId: string;
    },
  ): Promise<CashFlowRow> {
    const [row] = await tx.insert(cashFlows).values(input).returning();
    return row;
  },

  async update(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      values: Partial<Pick<CashFlowRow, "openingBalance" | "timeframe">>;
    },
  ): Promise<CashFlowRow | undefined> {
    const [row] = await tx
      .update(cashFlows)
      .set({
        ...input.values,
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cashFlows.id, input.id),
          eq(cashFlows.version, input.expectedVersion),
        ),
      )
      .returning();
    return row;
  },

  async touch(tx: Transaction, id: string): Promise<void> {
    await tx
      .update(cashFlows)
      .set({ updatedAt: new Date() })
      .where(eq(cashFlows.id, id));
  },
};

/** Persistence for department spend windows (one per department per cash flow). */
export const cashFlowWindowRepository = {
  async listByCashFlow(
    executor: DatabaseExecutor,
    cashFlowId: string,
  ): Promise<CashFlowDepartmentWindowRow[]> {
    return executor
      .select()
      .from(cashFlowDepartmentWindows)
      .where(eq(cashFlowDepartmentWindows.cashFlowId, cashFlowId));
  },

  async find(
    executor: DatabaseExecutor,
    input: { cashFlowId: string; budgetDepartmentId: string },
  ): Promise<CashFlowDepartmentWindowRow | undefined> {
    const [row] = await executor
      .select()
      .from(cashFlowDepartmentWindows)
      .where(
        and(
          eq(cashFlowDepartmentWindows.cashFlowId, input.cashFlowId),
          eq(
            cashFlowDepartmentWindows.budgetDepartmentId,
            input.budgetDepartmentId,
          ),
        ),
      )
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: {
      cashFlowId: string;
      budgetDepartmentId: string;
      startDate: string;
      endDate: string;
    },
  ): Promise<CashFlowDepartmentWindowRow> {
    const [row] = await tx
      .insert(cashFlowDepartmentWindows)
      .values(input)
      .returning();
    return row;
  },

  async update(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      startDate: string;
      endDate: string;
    },
  ): Promise<CashFlowDepartmentWindowRow | undefined> {
    const [row] = await tx
      .update(cashFlowDepartmentWindows)
      .set({
        startDate: input.startDate,
        endDate: input.endDate,
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cashFlowDepartmentWindows.id, input.id),
          eq(cashFlowDepartmentWindows.version, input.expectedVersion),
        ),
      )
      .returning();
    return row;
  },

  async delete(
    tx: Transaction,
    input: { id: string; expectedVersion: number },
  ): Promise<boolean> {
    const rows = await tx
      .delete(cashFlowDepartmentWindows)
      .where(
        and(
          eq(cashFlowDepartmentWindows.id, input.id),
          eq(cashFlowDepartmentWindows.version, input.expectedVersion),
        ),
      )
      .returning({ id: cashFlowDepartmentWindows.id });
    return rows.length > 0;
  },
};

/** Persistence for one-off payments. */
export const cashFlowPaymentRepository = {
  async listByCashFlow(
    executor: DatabaseExecutor,
    cashFlowId: string,
  ): Promise<CashFlowPaymentRecord[]> {
    return executor
      .select({ payment: cashFlowPayments, createdBy: userColumns })
      .from(cashFlowPayments)
      .innerJoin(
        applicationUsers,
        eq(cashFlowPayments.createdByUserId, applicationUsers.id),
      )
      .where(eq(cashFlowPayments.cashFlowId, cashFlowId))
      .orderBy(
        asc(cashFlowPayments.date),
        asc(cashFlowPayments.createdAt),
        asc(cashFlowPayments.id),
      );
  },

  async find(
    executor: DatabaseExecutor,
    input: { cashFlowId: string; paymentId: string },
  ): Promise<CashFlowPaymentRecord | undefined> {
    const [row] = await executor
      .select({ payment: cashFlowPayments, createdBy: userColumns })
      .from(cashFlowPayments)
      .innerJoin(
        applicationUsers,
        eq(cashFlowPayments.createdByUserId, applicationUsers.id),
      )
      .where(
        and(
          eq(cashFlowPayments.id, input.paymentId),
          eq(cashFlowPayments.cashFlowId, input.cashFlowId),
        ),
      )
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: {
      cashFlowId: string;
      budgetDepartmentId: string;
      name: string;
      amount: string;
      direction: CashFlowPaymentRow["direction"];
      date: string;
      note: string | null;
      createdByUserId: string;
    },
  ): Promise<CashFlowPaymentRow> {
    const [row] = await tx.insert(cashFlowPayments).values(input).returning();
    return row;
  },

  async update(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      values: CashFlowPaymentEditableFields;
    },
  ): Promise<CashFlowPaymentRow | undefined> {
    const [row] = await tx
      .update(cashFlowPayments)
      .set({
        ...input.values,
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cashFlowPayments.id, input.id),
          eq(cashFlowPayments.version, input.expectedVersion),
        ),
      )
      .returning();
    return row;
  },

  async delete(
    tx: Transaction,
    input: { id: string; expectedVersion: number },
  ): Promise<boolean> {
    const rows = await tx
      .delete(cashFlowPayments)
      .where(
        and(
          eq(cashFlowPayments.id, input.id),
          eq(cashFlowPayments.version, input.expectedVersion),
        ),
      )
      .returning({ id: cashFlowPayments.id });
    return rows.length > 0;
  },
};

/** Persistence for per-source expected-date overrides. */
export const cashFlowSourceTimingRepository = {
  async listByCashFlow(
    executor: DatabaseExecutor,
    cashFlowId: string,
  ): Promise<CashFlowSourceTimingRow[]> {
    return executor
      .select()
      .from(cashFlowSourceTimings)
      .where(eq(cashFlowSourceTimings.cashFlowId, cashFlowId));
  },

  async find(
    executor: DatabaseExecutor,
    input: { cashFlowId: string; financeSourceId: string },
  ): Promise<CashFlowSourceTimingRow | undefined> {
    const [row] = await executor
      .select()
      .from(cashFlowSourceTimings)
      .where(
        and(
          eq(cashFlowSourceTimings.cashFlowId, input.cashFlowId),
          eq(cashFlowSourceTimings.financeSourceId, input.financeSourceId),
        ),
      )
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: {
      cashFlowId: string;
      financeSourceId: string;
      expectedDate: string;
    },
  ): Promise<CashFlowSourceTimingRow> {
    const [row] = await tx
      .insert(cashFlowSourceTimings)
      .values(input)
      .returning();
    return row;
  },

  async update(
    tx: Transaction,
    input: { id: string; expectedVersion: number; expectedDate: string },
  ): Promise<CashFlowSourceTimingRow | undefined> {
    const [row] = await tx
      .update(cashFlowSourceTimings)
      .set({
        expectedDate: input.expectedDate,
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cashFlowSourceTimings.id, input.id),
          eq(cashFlowSourceTimings.version, input.expectedVersion),
        ),
      )
      .returning();
    return row;
  },

  async delete(
    tx: Transaction,
    input: { id: string; expectedVersion: number },
  ): Promise<boolean> {
    const rows = await tx
      .delete(cashFlowSourceTimings)
      .where(
        and(
          eq(cashFlowSourceTimings.id, input.id),
          eq(cashFlowSourceTimings.version, input.expectedVersion),
        ),
      )
      .returning({ id: cashFlowSourceTimings.id });
    return rows.length > 0;
  },
};
