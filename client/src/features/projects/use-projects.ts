import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from "@shared/contracts";
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

const projectKey = (id: string) => ["projects", id] as const;
const projectLists = () => ["projects", "list"] as const;

export function useProjects(archived: "true" | "false" | "all" = "false") {
  return useInfiniteQuery({
    queryKey: [...projectLists(), archived],
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

function useProjectMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: projectLists() });
      if (
        typeof variables === "object" &&
        variables !== null &&
        "id" in variables &&
        typeof variables.id === "string"
      ) {
        void queryClient.invalidateQueries({
          queryKey: projectKey(variables.id),
        });
      }
    },
  });
}

export function useCreateProject() {
  return useProjectMutation((input: CreateProjectInput) =>
    createProject(input),
  );
}
export function useUpdateProject() {
  return useProjectMutation(
    ({ id, input }: { id: string; input: UpdateProjectInput }) =>
      updateProject(id, input),
  );
}
export function useTransitionProjectStage() {
  return useProjectMutation(
    ({
      id,
      input,
    }: {
      id: string;
      input: { toStage: Project["stage"]; version: number; note?: string };
    }) => transitionProjectStage(id, input),
  );
}
export function useArchiveProject() {
  return useProjectMutation(
    ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof archiveProject>[1];
    }) => archiveProject(id, input),
  );
}
export function useRestoreProject() {
  return useProjectMutation(
    ({ id, version }: { id: string; version: number }) =>
      restoreProject(id, version),
  );
}
export function useDeleteProject() {
  return useProjectMutation(
    ({ id, version }: { id: string; version: number }) =>
      deleteProject(id, version),
  );
}
