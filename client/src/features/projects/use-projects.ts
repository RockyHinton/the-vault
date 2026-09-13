import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from "@shared/contracts";
import { useVaultMutation } from "@/lib/mutations";
import {
  archiveProject,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  restoreProject,
  transitionProjectStage,
  updateProject,
} from "./projects-api";

export const projectKey = (id: string) => ["projects", id] as const;
export const projectListsKey = () => ["projects", "list"] as const;
const auditKey = ["audit-events"] as const;

export function useProjects(archived: "true" | "false" | "all" = "false") {
  return useInfiniteQuery({
    queryKey: [...projectListsKey(), archived],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listProjects(archived, pageParam),
    getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: projectKey(id ?? ""),
    queryFn: () => getProject(id!),
    enabled: Boolean(id),
  });
}

/** Lists and the audit log change on every command; the item changes when it has an id. */
const afterProjectChange = (variables: { id?: string }) => [
  projectListsKey(),
  auditKey,
  ...(variables.id ? [projectKey(variables.id)] : []),
];

export function useCreateProject() {
  return useVaultMutation({
    mutationFn: (input: CreateProjectInput) => createProject(input),
    invalidate: () => [projectListsKey(), auditKey],
    successMessage: "Project created.",
  });
}
export function useUpdateProject() {
  return useVaultMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProjectInput }) =>
      updateProject(id, input),
    invalidate: afterProjectChange,
    successMessage: "Project updated.",
  });
}
export function useTransitionProjectStage() {
  return useVaultMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { toStage: Project["stage"]; version: number; note?: string };
    }) => transitionProjectStage(id, input),
    invalidate: afterProjectChange,
    successMessage: (result) =>
      `Project moved to ${result.data.stage === "development" ? "Development" : result.data.stage === "production" ? "Production" : "Evaluation"}.`,
  });
}
export function useArchiveProject() {
  return useVaultMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof archiveProject>[1];
    }) => archiveProject(id, input),
    invalidate: afterProjectChange,
    successMessage: "Project archived.",
  });
}
export function useRestoreProject() {
  return useVaultMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      restoreProject(id, version),
    invalidate: afterProjectChange,
    successMessage: "Project restored.",
  });
}
export function useDeleteProject() {
  return useVaultMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      deleteProject(id, version),
    invalidate: afterProjectChange,
    successMessage: "Project deleted.",
  });
}
