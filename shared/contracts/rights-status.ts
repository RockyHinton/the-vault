import type { ProjectStage } from "./api";

/**
 * Rights status vocabulary is stage-dependent: what "secured" means during
 * evaluation differs from production. "optioned" belongs to two stages.
 */
export const rightsStatusValues = [
  "identified",
  "contacted",
  "under_review",
  "option_pending",
  "optioned",
  "not_available",
  "extended",
  "purchase_pending",
  "purchased",
  "rights_issue",
  "cleared",
  "chain_complete",
  "missing_doc",
  "expired",
  "legal_hold",
] as const;
export type RightsStatus = (typeof rightsStatusValues)[number];

export const rightsStatusesByStage: Record<
  ProjectStage,
  readonly RightsStatus[]
> = {
  evaluation: [
    "identified",
    "contacted",
    "under_review",
    "option_pending",
    "optioned",
    "not_available",
  ],
  development: [
    "optioned",
    "extended",
    "purchase_pending",
    "purchased",
    "rights_issue",
  ],
  production: [
    "cleared",
    "chain_complete",
    "missing_doc",
    "expired",
    "legal_hold",
  ],
};

export function isRightsStatusAllowedForStage(
  stage: ProjectStage,
  status: RightsStatus,
): boolean {
  return rightsStatusesByStage[stage].includes(status);
}

/** The first status of a stage is the natural starting point for a new item. */
export function defaultRightsStatusForStage(stage: ProjectStage): RightsStatus {
  return rightsStatusesByStage[stage][0];
}

export type RightsSummary = "cleared" | "at_risk" | "in_progress" | "none";

const atRiskByStage: Record<ProjectStage, readonly RightsStatus[]> = {
  evaluation: ["not_available"],
  development: ["rights_issue"],
  production: ["expired", "legal_hold", "missing_doc"],
};
const clearedByStage: Record<ProjectStage, readonly RightsStatus[]> = {
  evaluation: ["optioned"],
  development: ["purchased"],
  production: ["cleared", "chain_complete"],
};

/**
 * The page-level rights position for the project's current stage: any at-risk
 * item makes the project at risk; every item secured makes it cleared.
 */
export function summarizeRightsForStage(
  stage: ProjectStage,
  statuses: readonly RightsStatus[],
): RightsSummary {
  if (statuses.length === 0) return "none";
  if (statuses.some((status) => atRiskByStage[stage].includes(status)))
    return "at_risk";
  if (statuses.every((status) => clearedByStage[stage].includes(status)))
    return "cleared";
  return "in_progress";
}
