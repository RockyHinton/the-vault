import {
  rightsTypeSchema,
  type ProjectStage,
  type RightsStatus,
  type RightsSummary,
  type RightsType,
} from "@shared/contracts";

export const rightsTypes = rightsTypeSchema.options;
export const rightsTypeLabels: Record<RightsType, string> = {
  original: "Original",
  book: "Book",
  article: "Article",
  life_rights: "Life Rights",
  remake: "Remake",
  other: "Other",
};

export const rightsStatusLabels: Record<RightsStatus, string> = {
  identified: "Identified",
  contacted: "Contacted",
  under_review: "Under Review",
  option_pending: "Option Pending",
  optioned: "Optioned",
  not_available: "Not Available",
  extended: "Extended",
  purchase_pending: "Purchase Pending",
  purchased: "Purchased",
  rights_issue: "Rights Issue",
  cleared: "Cleared",
  chain_complete: "Chain Complete",
  missing_doc: "Missing Doc",
  expired: "Expired",
  legal_hold: "Legal Hold",
};

export const rightsStageHelper: Record<ProjectStage, string> = {
  evaluation:
    "Track rights early to avoid developing material you can’t control.",
  development:
    "Rights should be secured or under active option during development.",
  production:
    "Production requires cleared rights and complete chain of title for finance & E&O.",
};

export const rightsSummaryLabels: Record<RightsSummary, string> = {
  cleared: "Cleared",
  at_risk: "At Risk",
  in_progress: "In Progress",
  none: "No rights items",
};

type Variant = "default" | "secondary" | "destructive" | "outline";

export function rightsSummaryVariant(summary: RightsSummary): Variant {
  if (summary === "cleared") return "default";
  if (summary === "at_risk") return "destructive";
  return "secondary";
}

/** Badge tone of one status in the context of the project's stage. */
export function rightsStatusVariant(
  stage: ProjectStage,
  status: RightsStatus,
): Variant {
  if (stage === "production") {
    if (status === "cleared" || status === "chain_complete") return "default";
    if (status === "legal_hold" || status === "expired") return "destructive";
    return "secondary";
  }
  if (stage === "development") {
    if (status === "purchased") return "default";
    if (status === "rights_issue") return "destructive";
    if (status === "purchase_pending" || status === "extended")
      return "secondary";
    return "outline";
  }
  if (status === "optioned") return "default";
  if (status === "not_available") return "destructive";
  if (status === "option_pending" || status === "under_review")
    return "secondary";
  return "outline";
}
