import type { FinancingOverview } from "@shared/contracts";
import type { Database } from "../../db/client";
import { ApiError } from "../../http/errors";
import { projectRepository } from "../projects/project-repository";
import type { BudgetService } from "../budget/budget-service";
import type { CashFlowService } from "../cash-flow/cash-flow-service";
import type { FinancePlanService } from "../finance-plan/finance-plan-service";

const absent = async <T>(read: Promise<T>): Promise<T | null> => {
  try {
    return await read;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
};

/**
 * The Financing Overview is a read model composed from the three Finance
 * services at request time. It owns no table and stores nothing: every
 * number is the budget's exact locked total, the plan's `summarizeFinancing`
 * result or the cash flow's `projectCashFlow` result.
 */
export function createFinancingOverviewService(deps: {
  db: Database;
  budgetService: BudgetService;
  financePlanService: FinancePlanService;
  cashFlowService: CashFlowService;
}) {
  return {
    async get(projectId: string): Promise<FinancingOverview> {
      if (!(await projectRepository.findById(deps.db, projectId)))
        throw new ApiError(
          404,
          "PROJECT_NOT_FOUND",
          "The project was not found.",
        );
      const budget = await absent(deps.budgetService.get(projectId));
      const [plan, cashFlow] = await Promise.all([
        absent(deps.financePlanService.get(projectId)),
        absent(deps.cashFlowService.get(projectId)),
      ]);
      const lockedVersion =
        budget?.versions.find((v) => v.id === budget.latestLockedVersionId) ??
        null;
      const openVersion =
        budget?.versions.find((v) => v.status !== "locked") ?? null;
      const period = (id: string | null) =>
        cashFlow?.projection.periods.find((p) => p.id === id)?.label ?? null;
      return {
        currency: budget?.currency ?? null,
        budget: budget
          ? {
              id: budget.id,
              lockedVersion: lockedVersion
                ? {
                    id: lockedVersion.id,
                    versionNumber: lockedVersion.versionNumber,
                    total: lockedVersion.total,
                    lockedBy: lockedVersion.lockedBy,
                    lockedAt: lockedVersion.lockedAt,
                  }
                : null,
              openVersionStatus: openVersion?.status ?? null,
            }
          : null,
        financePlan: plan
          ? {
              id: plan.id,
              budgetVersionId: plan.budgetVersionId,
              budgetVersionNumber: plan.budgetVersionNumber,
              summary: plan.summary,
              sources: plan.sources.map((s) => ({
                id: s.id,
                name: s.name,
                type: s.type,
                status: s.status,
                amount: s.amount,
              })),
            }
          : null,
        cashFlow: cashFlow
          ? {
              id: cashFlow.id,
              timeframe: cashFlow.timeframe,
              openingBalance: cashFlow.openingBalance,
              totalInflow: cashFlow.projection.totalInflow,
              totalOutflow: cashFlow.projection.totalOutflow,
              closingBalance: cashFlow.projection.closingBalance,
              lowestBalance: cashFlow.projection.lowestBalance,
              lowestBalancePeriodLabel: period(
                cashFlow.projection.lowestBalancePeriodId,
              ),
              firstShortfallPeriodLabel: period(
                cashFlow.projection.firstShortfallPeriodId,
              ),
              periodCount: cashFlow.projection.periods.length,
              unscheduledInflow: cashFlow.projection.unscheduledInflow,
              unscheduledOutflow: cashFlow.projection.unscheduledOutflow,
            }
          : null,
      };
    },
  };
}

export type FinancingOverviewService = ReturnType<
  typeof createFinancingOverviewService
>;
