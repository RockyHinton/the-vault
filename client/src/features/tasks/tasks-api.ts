import {
  apiSuccessSchema,
  taskSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "@shared/contracts";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";

const taskResponse = apiSuccessSchema(taskSchema);
const taskListResponse = apiSuccessSchema(
  z.object({ items: z.array(taskSchema) }),
);
const base = (projectId: string) => `/projects/${projectId}/tasks`;

export const listTasks = (projectId: string) =>
  apiClient("GET", base(projectId), taskListResponse);
export const createTask = (projectId: string, input: CreateTaskInput) =>
  apiClient("POST", base(projectId), taskResponse, input);
export const updateTask = (
  projectId: string,
  taskId: string,
  input: UpdateTaskInput,
) => apiClient("PATCH", `${base(projectId)}/${taskId}`, taskResponse, input);
export const completeTask = (
  projectId: string,
  taskId: string,
  version: number,
) =>
  apiClient("POST", `${base(projectId)}/${taskId}/complete`, taskResponse, {
    version,
  });
export const reopenTask = (
  projectId: string,
  taskId: string,
  version: number,
) =>
  apiClient("POST", `${base(projectId)}/${taskId}/reopen`, taskResponse, {
    version,
  });
export const deleteTask = (
  projectId: string,
  taskId: string,
  version: number,
) =>
  apiClient("DELETE", `${base(projectId)}/${taskId}`, z.undefined(), {
    version,
  });
