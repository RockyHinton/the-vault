import { useQuery } from "@tanstack/react-query";
import type { CreateTaskInput, UpdateTaskInput } from "@shared/contracts";
import { useVaultMutation } from "@/lib/mutations";
import {
  completeTask,
  createTask,
  deleteTask,
  listTasks,
  reopenTask,
  updateTask,
} from "./tasks-api";

export const tasksKey = (projectId: string) => ["tasks", projectId] as const;
const auditKey = ["audit-events"] as const;
const afterChange = ({ projectId }: { projectId: string }) => [
  tasksKey(projectId),
  auditKey,
];

interface TaskRef {
  projectId: string;
  taskId: string;
  version: number;
}

export function useTasks(projectId: string) {
  return useQuery({
    queryKey: tasksKey(projectId),
    queryFn: () => listTasks(projectId),
  });
}

export function useCreateTask() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: CreateTaskInput;
    }) => createTask(projectId, input),
    invalidate: afterChange,
    successMessage: "Task created.",
  });
}

export function useUpdateTask() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      taskId,
      input,
    }: {
      projectId: string;
      taskId: string;
      input: UpdateTaskInput;
    }) => updateTask(projectId, taskId, input),
    invalidate: afterChange,
    successMessage: "Task updated.",
  });
}

export function useCompleteTask() {
  return useVaultMutation({
    mutationFn: ({ projectId, taskId, version }: TaskRef) =>
      completeTask(projectId, taskId, version),
    invalidate: afterChange,
    successMessage: "Task completed.",
  });
}

export function useReopenTask() {
  return useVaultMutation({
    mutationFn: ({ projectId, taskId, version }: TaskRef) =>
      reopenTask(projectId, taskId, version),
    invalidate: afterChange,
    successMessage: "Task reopened.",
  });
}

export function useDeleteTask() {
  return useVaultMutation({
    mutationFn: ({ projectId, taskId, version }: TaskRef) =>
      deleteTask(projectId, taskId, version),
    invalidate: afterChange,
    successMessage: "Task deleted.",
  });
}
