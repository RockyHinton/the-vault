import {
  projectCashFlow,
  type CashFlow,
  type CashFlowDepartment,
  type CashFlowPayment,
  type CashFlowSource,
  type CreateCashFlowPaymentInput,
  type SetCashFlowDepartmentWindowInput,
  type SetCashFlowSourceTimingInput,
  type UpdateCashFlowInput,
  type UpdateCashFlowPaymentInput,
} from "@shared/contracts";
import type { Database } from "../../db/client";
import { withTransaction, type Transaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { withUniqueViolationAsConflict } from "../../db/unique-violation";
import { appendAuditEvent } from "../audit/audit-repository";
import {
  budgetDepartmentRepository,
  budgetLineItemRepository,
} from "../budget/budget-repository";
import {
  financePlanRepository,
  financeSourceRepository,
  type FinancePlanRecord,
} from "../finance-plan/finance-plan-repository";
import { projectRepository } from "../projects/project-repository";
import { toUserRef } from "../users/user-ref";
import {
  cashFlowPaymentRepository,
  cashFlowRepository,
  cashFlowSourceTimingRepository,
  cashFlowWindowRepository,
  type CashFlowPaymentEditableFields,
  type CashFlowPaymentRecord,
  type CashFlowRecord,
} from "./cash-flow-repository";

export interface CashFlowActor {
  userId: string;
  role: "studio_admin" | "user";
  requestId: string;
}

const ZERO = "0.00";

function requireCashFlow(record: CashFlowRecord | undefined): CashFlowRecord {
  if (!record)
    throw new ApiError(
      404,
      "CASH_FLOW_NOT_FOUND",
      "This project has no cash flow yet.",
    );
  return record;
}

function requireFresh<T>(row: T | undefined): T {
  if (!row)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "The cash flow changed while you were editing. Refresh and try again.",
    );
  return row;
}

/** Removing an authored payment follows the authored-record rule. */
function assertCanRemove(
  actor: CashFlowActor,
  record: CashFlowPaymentRecord,
): void {
  if (actor.role === "studio_admin") return;
  if (record.payment.createdByUserId === actor.userId) return;
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Only the user who added this payment or a studio administrator can remove it.",
  );
}

function toPayment(record: CashFlowPaymentRecord): CashFlowPayment {
  const { payment, createdBy } = record;
  return {
    id: payment.id,
    cashFlowId: payment.cashFlowId,
    departmentId: payment.budgetDepartmentId,
    name: payment.name,
    amount: payment.amount,
    direction: payment.direction,
    date: payment.date,
    note: payment.note,
    createdBy: toUserRef(createdBy),
    version: payment.version,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

/** Today as a UTC calendar date; the projection range always includes it. */
const todayUtc = () => new Date().toISOString().slice(0, 10);

/**
 * Cash Flow use-cases. One schedule per project over the finance plan's
 * exact locked budget version: departments and their totals come from that
 * version, inflows are the plan's approved sources, and the only authored
 * state is timing (windows, payments, per-source dates), the timeframe and
 * the opening balance. Every balance is `projectCashFlow` on read.
 * Editing is collaborative; removing a payment is creator-or-admin.
 */
export function createCashFlowService({ db }: { db: Database }) {
  async function requirePlan(
    executor: Transaction | Database,
    projectId: string,
  ): Promise<FinancePlanRecord> {
    const plan = await financePlanRepository.findByProject(executor, projectId);
    if (!plan)
      throw new ApiError(
        422,
        "FINANCE_PLAN_REQUIRED",
        "Create the finance plan against a locked budget before scheduling cash flow.",
      );
    return plan;
  }

  async function load(
    executor: Transaction | Database,
    projectId: string,
  ): Promise<CashFlow> {
    const record = requireCashFlow(
      await cashFlowRepository.findByProject(executor, projectId),
    );
    const plan = await requirePlan(executor, projectId);
    const cashFlowId = record.cashFlow.id;
    const departments = await budgetDepartmentRepository.listByVersion(
      executor,
      plan.plan.budgetVersionId,
    );
    const departmentIds = departments.map((d) => d.id);
    const [totals, sources, windows, payments, timings] = await Promise.all([
      budgetLineItemRepository.totalsByDepartment(executor, departmentIds),
      financeSourceRepository.listByPlan(executor, plan.plan.id),
      cashFlowWindowRepository.listByCashFlow(executor, cashFlowId),
      cashFlowPaymentRepository.listByCashFlow(executor, cashFlowId),
      cashFlowSourceTimingRepository.listByCashFlow(executor, cashFlowId),
    ]);
    // Rows that reference departments of a version the plan no longer points
    // at (after a rebase) are kept for provenance but are not part of the schedule.
    const contractDepartments: CashFlowDepartment[] = departments.map(
      (department) => {
        const window = windows.find(
          (w) => w.budgetDepartmentId === department.id,
        );
        return {
          id: department.id,
          name: department.name,
          position: department.position,
          total: totals.get(department.id) ?? ZERO,
          window: window
            ? {
                startDate: window.startDate,
                endDate: window.endDate,
                version: window.version,
                updatedAt: window.updatedAt.toISOString(),
              }
            : null,
          payments: payments
            .filter((p) => p.payment.budgetDepartmentId === department.id)
            .map(toPayment),
        };
      },
    );
    const contractSources: CashFlowSource[] = sources
      .filter((s) => s.source.status === "approved")
      .map(({ source }) => {
        const timing = timings.find((t) => t.financeSourceId === source.id);
        return {
          id: source.id,
          name: source.name,
          type: source.type,
          amount: source.amount,
          expectedDate: source.expectedDate,
          timing: timing
            ? {
                expectedDate: timing.expectedDate,
                version: timing.version,
                updatedAt: timing.updatedAt.toISOString(),
              }
            : null,
          scheduledDate: timing?.expectedDate ?? source.expectedDate,
        };
      });
    return {
      id: cashFlowId,
      projectId,
      financePlanId: plan.plan.id,
      budgetVersionId: plan.plan.budgetVersionId,
      budgetVersionNumber: plan.budgetVersionNumber,
      currency: plan.currency,
      timeframe: record.cashFlow.timeframe,
      openingBalance: record.cashFlow.openingBalance,
      departments: contractDepartments,
      sources: contractSources,
      projection: projectCashFlow({
        timeframe: record.cashFlow.timeframe,
        today: todayUtc(),
        openingBalance: record.cashFlow.openingBalance,
        departments: contractDepartments.map((d) => ({
          id: d.id,
          total: d.total,
          window: d.window,
        })),
        payments: contractDepartments.flatMap((d) =>
          d.payments.map((p) => ({
            departmentId: d.id,
            amount: p.amount,
            direction: p.direction,
            date: p.date,
          })),
        ),
        inflows: contractSources.map((s) => ({
          id: s.id,
          amount: s.amount,
          scheduledDate: s.scheduledDate,
        })),
      }),
      createdBy: toUserRef(record.createdBy),
      version: record.cashFlow.version,
      createdAt: record.cashFlow.createdAt.toISOString(),
      updatedAt: record.cashFlow.updatedAt.toISOString(),
    };
  }

  /** Resolves and row-locks the project's cash flow together with its plan for a mutating command. */
  async function lockCashFlow(tx: Transaction, projectId: string) {
    const record = requireCashFlow(
      await cashFlowRepository.findByProject(tx, projectId),
    );
    await cashFlowRepository.lockRow(tx, record.cashFlow.id);
    const plan = await requirePlan(tx, projectId);
    return { cashFlow: record.cashFlow, plan };
  }

  /** A department may be scheduled only if it belongs to the plan's referenced locked version. */
  async function requireDepartmentInVersion(
    tx: Transaction,
    projectId: string,
    budgetVersionId: string,
    departmentId: string,
  ) {
    const scope = await budgetDepartmentRepository.findScoped(tx, {
      projectId,
      departmentId,
    });
    if (!scope)
      throw new ApiError(
        404,
        "BUDGET_DEPARTMENT_NOT_FOUND",
        "The budget department was not found in this project.",
      );
    if (scope.version.id !== budgetVersionId)
      throw new ApiError(
        422,
        "DEPARTMENT_NOT_IN_REFERENCED_VERSION",
        "Cash flow schedules departments of the budget version the finance plan references.",
      );
    return scope.department;
  }

  /** Only approved sources of this plan are inflows. */
  async function requireApprovedSource(
    tx: Transaction,
    projectId: string,
    planId: string,
    sourceId: string,
  ) {
    const record = await financeSourceRepository.findScoped(tx, {
      projectId,
      sourceId,
    });
    if (!record || record.source.financePlanId !== planId)
      throw new ApiError(
        404,
        "FINANCE_SOURCE_NOT_FOUND",
        "The financing source was not found.",
      );
    if (record.source.status !== "approved")
      throw new ApiError(
        422,
        "FINANCE_SOURCE_NOT_APPROVED",
        "Only approved financing sources are scheduled as inflows.",
      );
    return record.source;
  }

  return {
    async get(projectId: string): Promise<CashFlow> {
      const project = await projectRepository.findById(db, projectId);
      if (!project)
        throw new ApiError(
          404,
          "PROJECT_NOT_FOUND",
          "The project was not found.",
        );
      return load(db, projectId);
    },

    async create(projectId: string, actor: CashFlowActor): Promise<CashFlow> {
      const cashFlowExists = () =>
        new ApiError(
          409,
          "CASH_FLOW_EXISTS",
          "This project already has a cash flow.",
        );
      await withUniqueViolationAsConflict(
        "cash_flows_project_unique",
        cashFlowExists,
        () =>
          withTransaction(db, async (tx) => {
            const project = await projectRepository.findById(tx, projectId);
            if (!project)
              throw new ApiError(
                404,
                "PROJECT_NOT_FOUND",
                "The project was not found.",
              );
            if (await cashFlowRepository.findByProject(tx, projectId))
              throw cashFlowExists();
            const plan = await requirePlan(tx, projectId);
            const created = await cashFlowRepository.insert(tx, {
              projectId,
              financePlanId: plan.plan.id,
              createdByUserId: actor.userId,
            });
            await appendAuditEvent(tx, {
              actorUserId: actor.userId,
              action: "cash_flow.created",
              entityType: "cash_flow",
              entityId: created.id,
              requestId: actor.requestId,
              metadata: {
                projectId,
                financePlanId: plan.plan.id,
                budgetVersionId: plan.plan.budgetVersionId,
              },
            });
          }),
      );
      return load(db, projectId);
    },

    /** Opening balance and timeframe; the cash flow's own version guards them. */
    async update(
      projectId: string,
      input: UpdateCashFlowInput,
      actor: CashFlowActor,
    ): Promise<CashFlow> {
      await withTransaction(db, async (tx) => {
        const { cashFlow } = await lockCashFlow(tx, projectId);
        requireFresh(
          await cashFlowRepository.update(tx, {
            id: cashFlow.id,
            expectedVersion: input.version,
            values: {
              openingBalance: input.openingBalance,
              timeframe: input.timeframe,
            },
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "cash_flow.updated",
          entityType: "cash_flow",
          entityId: cashFlow.id,
          requestId: actor.requestId,
          metadata: {
            projectId,
            ...(input.openingBalance !== undefined
              ? {
                  fromOpeningBalance: cashFlow.openingBalance,
                  toOpeningBalance: input.openingBalance,
                }
              : {}),
            ...(input.timeframe !== undefined
              ? {
                  fromTimeframe: cashFlow.timeframe,
                  toTimeframe: input.timeframe,
                }
              : {}),
          },
        });
      });
      return load(db, projectId);
    },

    /** `version: 0` creates the window, the current version replaces it. */
    async setDepartmentWindow(
      projectId: string,
      departmentId: string,
      input: SetCashFlowDepartmentWindowInput,
      actor: CashFlowActor,
    ): Promise<CashFlow> {
      await withTransaction(db, async (tx) => {
        const { cashFlow, plan } = await lockCashFlow(tx, projectId);
        await requireDepartmentInVersion(
          tx,
          projectId,
          plan.plan.budgetVersionId,
          departmentId,
        );
        const existing = await cashFlowWindowRepository.find(tx, {
          cashFlowId: cashFlow.id,
          budgetDepartmentId: departmentId,
        });
        if (input.version === 0) {
          requireFresh(existing ? undefined : true);
          await cashFlowWindowRepository.insert(tx, {
            cashFlowId: cashFlow.id,
            budgetDepartmentId: departmentId,
            startDate: input.startDate,
            endDate: input.endDate,
          });
        } else {
          requireFresh(
            existing &&
              (await cashFlowWindowRepository.update(tx, {
                id: existing.id,
                expectedVersion: input.version,
                startDate: input.startDate,
                endDate: input.endDate,
              })),
          );
        }
        await cashFlowRepository.touch(tx, cashFlow.id);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "cash_flow_department_window.set",
          entityType: "cash_flow",
          entityId: cashFlow.id,
          requestId: actor.requestId,
          metadata: {
            projectId,
            departmentId,
            ...(existing
              ? {
                  from: {
                    startDate: existing.startDate,
                    endDate: existing.endDate,
                  },
                }
              : {}),
            to: { startDate: input.startDate, endDate: input.endDate },
          },
        });
      });
      return load(db, projectId);
    },

    async clearDepartmentWindow(
      projectId: string,
      departmentId: string,
      expectedVersion: number,
      actor: CashFlowActor,
    ): Promise<CashFlow> {
      await withTransaction(db, async (tx) => {
        const { cashFlow } = await lockCashFlow(tx, projectId);
        const existing = await cashFlowWindowRepository.find(tx, {
          cashFlowId: cashFlow.id,
          budgetDepartmentId: departmentId,
        });
        if (!existing)
          throw new ApiError(
            404,
            "CASH_FLOW_WINDOW_NOT_FOUND",
            "This department has no spend window.",
          );
        requireFresh(
          (await cashFlowWindowRepository.delete(tx, {
            id: existing.id,
            expectedVersion,
          })) || undefined,
        );
        await cashFlowRepository.touch(tx, cashFlow.id);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "cash_flow_department_window.cleared",
          entityType: "cash_flow",
          entityId: cashFlow.id,
          requestId: actor.requestId,
          metadata: {
            projectId,
            departmentId,
            from: { startDate: existing.startDate, endDate: existing.endDate },
          },
        });
      });
      return load(db, projectId);
    },

    async createPayment(
      projectId: string,
      input: CreateCashFlowPaymentInput,
      actor: CashFlowActor,
    ): Promise<CashFlow> {
      await withTransaction(db, async (tx) => {
        const { cashFlow, plan } = await lockCashFlow(tx, projectId);
        await requireDepartmentInVersion(
          tx,
          projectId,
          plan.plan.budgetVersionId,
          input.departmentId,
        );
        const created = await cashFlowPaymentRepository.insert(tx, {
          cashFlowId: cashFlow.id,
          budgetDepartmentId: input.departmentId,
          name: input.name,
          amount: input.amount,
          direction: input.direction,
          date: input.date,
          note: input.note || null,
          createdByUserId: actor.userId,
        });
        await cashFlowRepository.touch(tx, cashFlow.id);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "cash_flow_payment.created",
          entityType: "cash_flow_payment",
          entityId: created.id,
          requestId: actor.requestId,
          metadata: {
            projectId,
            departmentId: input.departmentId,
            direction: input.direction,
            amount: input.amount,
            date: input.date,
          },
        });
      });
      return load(db, projectId);
    },

    async updatePayment(
      projectId: string,
      paymentId: string,
      input: UpdateCashFlowPaymentInput,
      actor: CashFlowActor,
    ): Promise<CashFlow> {
      await withTransaction(db, async (tx) => {
        const { cashFlow, plan } = await lockCashFlow(tx, projectId);
        const existing = await cashFlowPaymentRepository.find(tx, {
          cashFlowId: cashFlow.id,
          paymentId,
        });
        if (!existing)
          throw new ApiError(
            404,
            "CASH_FLOW_PAYMENT_NOT_FOUND",
            "The payment was not found.",
          );
        if (input.departmentId !== undefined)
          await requireDepartmentInVersion(
            tx,
            projectId,
            plan.plan.budgetVersionId,
            input.departmentId,
          );
        const values: CashFlowPaymentEditableFields = {
          budgetDepartmentId: input.departmentId,
          name: input.name,
          amount: input.amount,
          direction: input.direction,
          date: input.date,
          note: input.note === undefined ? undefined : input.note || null,
        };
        requireFresh(
          await cashFlowPaymentRepository.update(tx, {
            id: paymentId,
            expectedVersion: input.version,
            values,
          }),
        );
        await cashFlowRepository.touch(tx, cashFlow.id);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "cash_flow_payment.updated",
          entityType: "cash_flow_payment",
          entityId: paymentId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            changedFields: (
              Object.keys(values) as (keyof CashFlowPaymentEditableFields)[]
            ).filter((k) => values[k] !== undefined),
            ...(input.amount !== undefined
              ? { fromAmount: existing.payment.amount, toAmount: input.amount }
              : {}),
            ...(input.date !== undefined
              ? { fromDate: existing.payment.date, toDate: input.date }
              : {}),
          },
        });
      });
      return load(db, projectId);
    },

    async deletePayment(
      projectId: string,
      paymentId: string,
      expectedVersion: number,
      actor: CashFlowActor,
    ): Promise<CashFlow> {
      await withTransaction(db, async (tx) => {
        const { cashFlow } = await lockCashFlow(tx, projectId);
        const existing = await cashFlowPaymentRepository.find(tx, {
          cashFlowId: cashFlow.id,
          paymentId,
        });
        if (!existing)
          throw new ApiError(
            404,
            "CASH_FLOW_PAYMENT_NOT_FOUND",
            "The payment was not found.",
          );
        assertCanRemove(actor, existing);
        requireFresh(
          (await cashFlowPaymentRepository.delete(tx, {
            id: paymentId,
            expectedVersion,
          })) || undefined,
        );
        await cashFlowRepository.touch(tx, cashFlow.id);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "cash_flow_payment.deleted",
          entityType: "cash_flow_payment",
          entityId: paymentId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            name: existing.payment.name,
            amount: existing.payment.amount,
            date: existing.payment.date,
          },
        });
      });
      return load(db, projectId);
    },

    /** A cash-flow-only expected date for an approved source. `version: 0` creates it. */
    async setSourceTiming(
      projectId: string,
      sourceId: string,
      input: SetCashFlowSourceTimingInput,
      actor: CashFlowActor,
    ): Promise<CashFlow> {
      await withTransaction(db, async (tx) => {
        const { cashFlow, plan } = await lockCashFlow(tx, projectId);
        await requireApprovedSource(tx, projectId, plan.plan.id, sourceId);
        const existing = await cashFlowSourceTimingRepository.find(tx, {
          cashFlowId: cashFlow.id,
          financeSourceId: sourceId,
        });
        if (input.version === 0) {
          requireFresh(existing ? undefined : true);
          await cashFlowSourceTimingRepository.insert(tx, {
            cashFlowId: cashFlow.id,
            financeSourceId: sourceId,
            expectedDate: input.expectedDate,
          });
        } else {
          requireFresh(
            existing &&
              (await cashFlowSourceTimingRepository.update(tx, {
                id: existing.id,
                expectedVersion: input.version,
                expectedDate: input.expectedDate,
              })),
          );
        }
        await cashFlowRepository.touch(tx, cashFlow.id);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "cash_flow_source_timing.set",
          entityType: "cash_flow",
          entityId: cashFlow.id,
          requestId: actor.requestId,
          metadata: {
            projectId,
            sourceId,
            ...(existing ? { from: existing.expectedDate } : {}),
            to: input.expectedDate,
          },
        });
      });
      return load(db, projectId);
    },

    async clearSourceTiming(
      projectId: string,
      sourceId: string,
      expectedVersion: number,
      actor: CashFlowActor,
    ): Promise<CashFlow> {
      await withTransaction(db, async (tx) => {
        const { cashFlow } = await lockCashFlow(tx, projectId);
        const existing = await cashFlowSourceTimingRepository.find(tx, {
          cashFlowId: cashFlow.id,
          financeSourceId: sourceId,
        });
        if (!existing)
          throw new ApiError(
            404,
            "CASH_FLOW_TIMING_NOT_FOUND",
            "This source has no cash-flow timing override.",
          );
        requireFresh(
          (await cashFlowSourceTimingRepository.delete(tx, {
            id: existing.id,
            expectedVersion,
          })) || undefined,
        );
        await cashFlowRepository.touch(tx, cashFlow.id);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "cash_flow_source_timing.cleared",
          entityType: "cash_flow",
          entityId: cashFlow.id,
          requestId: actor.requestId,
          metadata: { projectId, sourceId, from: existing.expectedDate },
        });
      });
      return load(db, projectId);
    },
  };
}

export type CashFlowService = ReturnType<typeof createCashFlowService>;
