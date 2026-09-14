import { createContext, useContext, type ReactNode } from "react";
import type { Project } from "@shared/contracts";
import { useIsStudioAdmin } from "@/features/auth/use-current-user";
import { ApiClientError } from "@/lib/api-client";
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
 *
 * `notFound` is shown only when the server says the project does not exist
 * (404, which includes deleted projects); any other failure is `error`, so an
 * outage never reads as a missing project.
 */
export function ProjectWorkspaceProvider({
  projectId,
  loading,
  notFound,
  error,
  children,
}: {
  projectId: string | undefined;
  loading: ReactNode;
  notFound: ReactNode;
  error: (retry: () => void) => ReactNode;
  children: ReactNode;
}) {
  const projectQuery = useProject(projectId);
  const isStudioAdmin = useIsStudioAdmin();
  if (projectQuery.isLoading) return <>{loading}</>;
  if (
    projectQuery.isError &&
    !(
      projectQuery.error instanceof ApiClientError &&
      projectQuery.error.status === 404
    )
  )
    return <>{error(() => void projectQuery.refetch())}</>;
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
