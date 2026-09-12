import {
  apiSuccessSchema,
  projectSchema,
  type CreateProjectInput,
  type Project,
  type UpdateProjectInput,
} from "@shared/contracts";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";

const projectListResponse = apiSuccessSchema(
  z.object({
    items: z.array(projectSchema),
    nextCursor: z.string().uuid().nullable(),
  }),
);

export const listProjects = (
  archived: "true" | "false" | "all" = "false",
  cursor?: string,
) =>
  apiClient(
    "GET",
    `/projects?archived=${archived}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    projectListResponse,
  );
export const getProject = (id: string) =>
  apiClient("GET", `/projects/${id}`, apiSuccessSchema(projectSchema));
export const createProject = (input: CreateProjectInput) =>
  apiClient("POST", "/projects", apiSuccessSchema(projectSchema), input);
export const updateProject = (id: string, input: UpdateProjectInput) =>
  apiClient("PATCH", `/projects/${id}`, apiSuccessSchema(projectSchema), input);
export const transitionProjectStage = (
  id: string,
  input: { toStage: Project["stage"]; version: number; note?: string },
) =>
  apiClient(
    "POST",
    `/projects/${id}/stage-transitions`,
    apiSuccessSchema(projectSchema),
    input,
  );
export const archiveProject = (
  id: string,
  input: {
    reason: NonNullable<Project["archive"]>["reason"];
    revisit: NonNullable<Project["archive"]>["revisit"];
    starred: boolean;
    notes?: string;
    version: number;
  },
) =>
  apiClient(
    "POST",
    `/projects/${id}/archive`,
    apiSuccessSchema(projectSchema),
    input,
  );
export const restoreProject = (id: string, version: number) =>
  apiClient(
    "POST",
    `/projects/${id}/restore`,
    apiSuccessSchema(projectSchema),
    { version },
  );
export const deleteProject = (id: string, version: number) =>
  apiClient("DELETE", `/projects/${id}`, z.undefined(), { version });
