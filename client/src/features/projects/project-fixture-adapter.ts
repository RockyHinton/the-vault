import type { Project as ApiProject } from "@shared/contracts";
import type { Project as WorkspaceProject, ProjectStage } from "@/lib/store";

const stageForWorkspace: Record<ApiProject["stage"], ProjectStage> = {
  evaluation: "Evaluation",
  development: "Development",
  production: "Production",
};

const reasonForWorkspace = {
  creative_pass: "Creative pass",
  commercial_viability: "Commercial viability",
  financing_not_secured: "Financing not secured",
  rights_legal_issues: "Rights / legal issues",
  packaging_fell_through: "Packaging fell through",
  paused_strategic_timing: "Paused (strategic / timing)",
  produced_completed: "Produced / completed",
  withdrawn: "Withdrawn",
} as const;

/**
 * Temporary ownership boundary: projects are server-authoritative; richer
 * workspace feature data remains in the prototype fixture store until each
 * feature domain gets its own migration. Do not persist fixture fields here.
 */
export function toWorkspaceProject(
  project: ApiProject,
  transientFeatureState?: WorkspaceProject,
): WorkspaceProject {
  return {
    ...transientFeatureState,
    id: project.id,
    version: project.version,
    title: project.title,
    stage: project.archivedAt ? "Archived" : stageForWorkspace[project.stage],
    status: "Active",
    logline: project.logline ?? "",
    synopsis: project.synopsis ?? "",
    genre: project.genre ?? "",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archiveDetails: project.archive
      ? {
          reason: reasonForWorkspace[project.archive.reason],
          revisit:
            project.archive.revisit === "yes"
              ? "Yes"
              : project.archive.revisit === "maybe"
                ? "Maybe"
                : "No",
          starred: project.archive.starred,
          notes: project.archive.notes ?? undefined,
          archivedAt: project.archivedAt ?? undefined,
          archivedFromStage:
            stageForWorkspace[project.archive.archivedFromStage],
        }
      : undefined,
  };
}
