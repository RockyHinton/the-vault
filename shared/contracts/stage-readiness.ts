import type {
  EvaluationGates,
  FinancingOverview,
  LegalCategory,
  LegalRecord,
  Person,
} from "./api";
import {
  summarizeLegalCategory,
  type LegalCategoryCompletion,
} from "./legal-completion";
import { formatMoney } from "./money";

/**
 * The product rule for advancing a project's stage, stated once. The server's
 * stage-transition command evaluates it against authoritative state loaded at
 * command time and refuses while any blocker remains; the Evaluation and
 * Development screens call the same functions over the same contract shapes
 * only to preview it. A client-computed answer is never evidence on the server.
 */

export type StageReadinessArea = "evaluation" | "finance" | "legal" | "talent";

export interface StageBlocker {
  code: string;
  area: StageReadinessArea;
  message: string;
}

export type TalentReadiness = "Ready" | "Partial" | "Incomplete";

/**
 * The Development stage's talent rule. A project is talent-ready when at
 * least one cast member has a committed engagement; it is partial while
 * creatives are attached but no cast member has committed; it is incomplete
 * with no creatives at all. "Committed" is offered, confirmed, contracted or
 * attached.
 */
export const committedEngagementStatuses = new Set<
  NonNullable<Person["engagement"]["status"]>
>(["offered", "confirmed", "contracted", "attached"]);

export function talentReadiness(creatives: readonly Person[]): {
  status: TalentReadiness;
  reason: string;
} {
  const committedCast = creatives.filter(
    (person) =>
      person.creativeRoleType === "cast" &&
      person.engagement.status !== null &&
      committedEngagementStatuses.has(person.engagement.status),
  );
  if (committedCast.length > 0)
    return {
      status: "Ready",
      reason: `${committedCast.length} cast ${committedCast.length === 1 ? "member has" : "members have"} committed.`,
    };
  if (creatives.length > 0)
    return {
      status: "Partial",
      reason: `${creatives.length} creative${creatives.length === 1 ? "" : "s"} attached; no cast member has committed yet.`,
    };
  return { status: "Incomplete", reason: "No creatives attached yet." };
}

/** The Evaluation decision checklist, in display order. */
export const evaluationGateLabels: Record<keyof EvaluationGates, string> = {
  scriptApproved: "Script approved",
  budgetApproved: "Budget approved",
  financeApproved: "Finance approved",
  talentAttached: "Talent attached",
};

/** Evaluation → Development: every item on the decision checklist is met. */
export function developmentBlockers(gates: EvaluationGates): StageBlocker[] {
  return (Object.keys(evaluationGateLabels) as (keyof EvaluationGates)[])
    .filter((key) => !gates[key])
    .map((key) => ({
      code: "EVALUATION_GATE_UNMET",
      area: "evaluation",
      message: `Decision checklist: ${evaluationGateLabels[key]} is not met.`,
    }));
}

/** A legal category's completion from its records' current document statuses. */
export function legalCategoryCompletion(
  records: readonly LegalRecord[],
  category: LegalCategory,
): LegalCategoryCompletion {
  return summarizeLegalCategory(
    records
      .filter((record) => record.category === category)
      .map((record) => ({
        documentStatuses: record.documents.map((document) => document.status),
      })),
  ).completion;
}

export interface ProductionReadinessInput {
  financing: FinancingOverview;
  legalRecords: readonly LegalRecord[];
  creatives: readonly Person[];
}

/**
 * Development → Production: the budget is locked and fully funded with no
 * projected cash shortfall, chain of title is complete, no cast agreement is
 * pending, and at least one cast member has committed.
 */
export function productionBlockers({
  financing,
  legalRecords,
  creatives,
}: ProductionReadinessInput): StageBlocker[] {
  const blockers: StageBlocker[] = [];
  const budgetLocked = Boolean(financing.budget?.lockedVersion);
  const summary = financing.financePlan?.summary;
  if (!budgetLocked)
    blockers.push({
      code: "BUDGET_NOT_LOCKED",
      area: "finance",
      message: "Budget is not locked yet.",
    });
  if (budgetLocked && !(summary && summary.fundingGap === "0.00"))
    blockers.push(
      summary && financing.currency
        ? {
            code: "FUNDING_GAP",
            area: "finance",
            message: `Funding gap of ${formatMoney(summary.fundingGap, financing.currency)} remains.`,
          }
        : {
            code: "FINANCE_PLAN_MISSING",
            area: "finance",
            message: "No finance plan yet.",
          },
    );
  if (financing.cashFlow?.firstShortfallPeriodLabel)
    blockers.push({
      code: "CASH_FLOW_SHORTFALL",
      area: "finance",
      message: "Cashflow shortfall projected.",
    });
  if (legalCategoryCompletion(legalRecords, "chain_of_title") !== "completed")
    blockers.push({
      code: "CHAIN_OF_TITLE_INCOMPLETE",
      area: "legal",
      message: "Chain of Title not complete.",
    });
  if (
    legalCategoryCompletion(legalRecords, "cast_agreements") === "in_progress"
  )
    blockers.push({
      code: "CAST_AGREEMENTS_PENDING",
      area: "legal",
      message: "Cast agreements pending approval.",
    });
  if (talentReadiness(creatives).status === "Incomplete")
    blockers.push({
      code: "TALENT_NOT_CONFIRMED",
      area: "talent",
      message: "Key talent not confirmed.",
    });
  return blockers;
}
