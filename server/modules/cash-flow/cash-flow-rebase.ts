import type { Transaction } from "../../db/transaction";
import { budgetDepartmentRepository } from "../budget/budget-repository";
import {
  cashFlowPaymentRepository,
  cashFlowRepository,
  cashFlowWindowRepository,
} from "./cash-flow-repository";

/** What reconciling the schedule to a new budget version did. Counts only; nothing sensitive. */
export interface CashFlowReconciliation {
  windowsMoved: number;
  paymentsMoved: number;
  /** Kept on their original department and listed as unassigned: no counterpart in the new version. */
  windowsUnassigned: number;
  paymentsUnassigned: number;
}

/**
 * Re-points a project's authored cash-flow scheduling at the departments of
 * the budget version its finance plan now references. The Finance Plan rebase
 * calls this with its own transaction, after moving the plan, so the new
 * baseline and the schedule commit together or not at all. It is the Cash
 * Flow domain's one exported write primitive, the same shape as the Documents
 * domain's `createDocumentInTransaction`.
 *
 * Correspondence is department lineage, never name or position: a revision
 * copy keeps its source's `lineage_id`, so a renamed department still
 * corresponds, and a department deleted and re-created under the same name
 * does not.
 *
 * - A window or payment whose department's lineage exists in the target
 *   version moves to that department (its `version` increments).
 * - One with no counterpart (the department is not in the target version, or
 *   the target already holds a window for that lineage) stays on its original
 *   department row. It is never deleted: the cash flow lists it as unassigned
 *   and leaves it out of the projection until someone moves or removes it.
 *
 * Every row of the cash flow is considered, not only rows of the previous
 * version, so rebasing back to an earlier version brings earlier work back.
 */
export async function reconcileCashFlowInTransaction(
  tx: Transaction,
  input: { projectId: string; budgetVersionId: string },
): Promise<CashFlowReconciliation | null> {
  const record = await cashFlowRepository.findByProject(tx, input.projectId);
  if (!record) return null;
  const cashFlowId = record.cashFlow.id;
  // Cash-flow commands hold this lock while they check a department against
  // the plan's version, so none can slip a row onto the old version unseen.
  await cashFlowRepository.lockRow(tx, cashFlowId);

  const targets = await budgetDepartmentRepository.listByVersion(
    tx,
    input.budgetVersionId,
  );
  const targetIds = new Set(targets.map((d) => d.id));
  const targetByLineage = new Map(targets.map((d) => [d.lineageId, d.id]));
  const windows = await cashFlowWindowRepository.listByCashFlow(tx, cashFlowId);
  const payments = await cashFlowPaymentRepository.listByCashFlow(
    tx,
    cashFlowId,
  );
  const elsewhere = Array.from(
    new Set([
      ...windows.map((w) => w.budgetDepartmentId),
      ...payments.map((p) => p.payment.budgetDepartmentId),
    ]),
  ).filter((id) => !targetIds.has(id));
  const lineageOf = new Map(
    (
      await budgetDepartmentRepository.listByIds(tx, {
        projectId: input.projectId,
        ids: elsewhere,
      })
    ).map(({ department }) => [department.id, department.lineageId]),
  );
  const counterpart = (departmentId: string) => {
    const lineageId = lineageOf.get(departmentId);
    return lineageId === undefined ? undefined : targetByLineage.get(lineageId);
  };

  const result: CashFlowReconciliation = {
    windowsMoved: 0,
    paymentsMoved: 0,
    windowsUnassigned: 0,
    paymentsUnassigned: 0,
  };
  // One window per department per cash flow (unique index): never move a
  // second window onto a department that already has one.
  const windowed = new Set(
    windows.map((w) => w.budgetDepartmentId).filter((id) => targetIds.has(id)),
  );
  for (const window of windows) {
    if (targetIds.has(window.budgetDepartmentId)) continue;
    const to = counterpart(window.budgetDepartmentId);
    if (to && !windowed.has(to)) {
      await cashFlowWindowRepository.moveToDepartment(tx, {
        id: window.id,
        budgetDepartmentId: to,
      });
      windowed.add(to);
      result.windowsMoved += 1;
    } else {
      result.windowsUnassigned += 1;
    }
  }
  for (const { payment } of payments) {
    if (targetIds.has(payment.budgetDepartmentId)) continue;
    const to = counterpart(payment.budgetDepartmentId);
    if (to) {
      await cashFlowPaymentRepository.moveToDepartment(tx, {
        id: payment.id,
        budgetDepartmentId: to,
      });
      result.paymentsMoved += 1;
    } else {
      result.paymentsUnassigned += 1;
    }
  }
  if (result.windowsMoved + result.paymentsMoved > 0)
    await cashFlowRepository.touch(tx, cashFlowId);
  return result;
}
