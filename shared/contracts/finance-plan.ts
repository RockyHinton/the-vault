import { z } from "zod";
import { centsToMoney, moneyToCents, moneyTotalValueSchema } from "./money";

export const financeSourceStatusValues = [
  "targeted",
  "soft_committed",
  "approved",
] as const;
export type FinanceSourceStatus = (typeof financeSourceStatusValues)[number];

/** The one financing calculation: server and client both call it, nobody re-implements it. */
export interface FinancingSummaryInput {
  /** Exact total of the referenced budget version. */
  budgetTotal: string;
  sources: readonly { status: FinanceSourceStatus; amount: string }[];
}

export const financingSummarySchema = z.object({
  budgetTotal: moneyTotalValueSchema,
  targetedTotal: moneyTotalValueSchema,
  softCommittedTotal: moneyTotalValueSchema,
  approvedTotal: moneyTotalValueSchema,
  /** Soft committed plus approved. */
  committedTotal: moneyTotalValueSchema,
  /** Budget minus approved, never below zero. */
  fundingGap: moneyTotalValueSchema,
  /** Approved minus budget when approved financing exceeds the budget, else "0.00". */
  overFinancedBy: moneyTotalValueSchema,
});
export type FinancingSummary = z.infer<typeof financingSummarySchema>;

export function summarizeFinancing(
  input: FinancingSummaryInput,
): FinancingSummary {
  const zero = BigInt(0);
  const byStatus = { targeted: zero, soft_committed: zero, approved: zero };
  for (const source of input.sources)
    byStatus[source.status] += moneyToCents(source.amount);
  const budget = moneyToCents(input.budgetTotal);
  const gap = budget - byStatus.approved;
  return {
    budgetTotal: centsToMoney(budget),
    targetedTotal: centsToMoney(byStatus.targeted),
    softCommittedTotal: centsToMoney(byStatus.soft_committed),
    approvedTotal: centsToMoney(byStatus.approved),
    committedTotal: centsToMoney(byStatus.soft_committed + byStatus.approved),
    fundingGap: centsToMoney(gap > zero ? gap : zero),
    overFinancedBy: centsToMoney(gap < zero ? -gap : zero),
  };
}
