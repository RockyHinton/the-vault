import type { ProjectStage } from "@shared/contracts";

const allowedTransitions: Record<ProjectStage, readonly ProjectStage[]> = {
  evaluation: ["development"],
  development: ["production"],
  production: [],
};

export function canTransitionProjectStage(
  from: ProjectStage,
  to: ProjectStage,
): boolean {
  return allowedTransitions[from].includes(to);
}
