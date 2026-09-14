import type { Project } from "@shared/contracts";

/** The stage a project card or workspace header shows; archived projects read as their own stage. */
export type WorkspaceStage =
  "Evaluation" | "Development" | "Production" | "Archived";

export const stageLabels: Record<
  Project["stage"],
  Exclude<WorkspaceStage, "Archived">
> = {
  evaluation: "Evaluation",
  development: "Development",
  production: "Production",
};

export function workspaceStageOf(project: Project): WorkspaceStage {
  return project.archivedAt ? "Archived" : stageLabels[project.stage];
}

export const archiveReasonLabels: Record<
  NonNullable<Project["archive"]>["reason"],
  string
> = {
  creative_pass: "Creative pass",
  commercial_viability: "Commercial viability",
  financing_not_secured: "Financing not secured",
  rights_legal_issues: "Rights / legal issues",
  packaging_fell_through: "Packaging fell through",
  paused_strategic_timing: "Paused (strategic / timing)",
  produced_completed: "Produced / completed",
  withdrawn: "Withdrawn",
};

export const revisitLabels: Record<
  NonNullable<Project["archive"]>["revisit"],
  "Yes" | "Maybe" | "No"
> = {
  yes: "Yes",
  maybe: "Maybe",
  no: "No",
};
