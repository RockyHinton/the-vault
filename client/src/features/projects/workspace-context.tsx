import { createContext, useContext, type ReactNode } from "react";
import type { Project } from "@shared/contracts";
import { useIsStudioAdmin } from "@/features/auth/use-current-user";
import { useProject } from "./use-projects";

export interface ProjectWorkspace {
  /** The server-authoritative project. Domains fetch their own state separately. */
  project: Project;
  /** UX gating only; the server enforces every write. */
  isStudioAdmin: boolean;
}

const ProjectWorkspaceContext = createContext<ProjectWorkspace | null>(null);

/**
 * Loads the project once for the workspace shell. Each migrated domain view
 * adds its own query keyed by `project.id`; there is deliberately no single
 * "workspace" query that aggregates every domain.
 */
export function ProjectWorkspaceProvider({
  projectId,
  loading,
  notFound,
  children,
}: {
  projectId: string | undefined;
  loading: ReactNode;
  notFound: ReactNode;
  children: ReactNode;
}) {
  const projectQuery = useProject(projectId);
  const isStudioAdmin = useIsStudioAdmin();
  if (projectQuery.isLoading) return <>{loading}</>;
  const project = projectQuery.data?.data;
  if (!project) return <>{notFound}</>;
  return (
    <ProjectWorkspaceContext.Provider value={{ project, isStudioAdmin }}>
      {children}
    </ProjectWorkspaceContext.Provider>
  );
}

export function useProjectWorkspace(): ProjectWorkspace {
  const value = useContext(ProjectWorkspaceContext);
  if (!value)
    throw new Error(
      "useProjectWorkspace must be used inside ProjectWorkspaceProvider.",
    );
  return value;
}
