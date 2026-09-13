import {
  apiSuccessSchema,
  rightSchema,
  type ChangeRightStatusInput,
  type CreateRightInput,
  type UpdateRightInput,
} from "@shared/contracts";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";
import { ownerDocumentApi } from "@/components/documents/owner-document-api";

const rightResponse = apiSuccessSchema(rightSchema);
const rightListResponse = apiSuccessSchema(
  z.object({ items: z.array(rightSchema) }),
);
export const rightPath = (projectId: string, rightId?: string) =>
  `/projects/${projectId}/rights${rightId ? `/${rightId}` : ""}`;

export const listRights = (projectId: string) =>
  apiClient("GET", rightPath(projectId), rightListResponse);
export const createRight = (projectId: string, input: CreateRightInput) =>
  apiClient("POST", rightPath(projectId), rightResponse, input);
export const updateRight = (
  projectId: string,
  rightId: string,
  input: UpdateRightInput,
) => apiClient("PATCH", rightPath(projectId, rightId), rightResponse, input);
export const changeRightStatus = (
  projectId: string,
  rightId: string,
  input: ChangeRightStatusInput,
) =>
  apiClient(
    "POST",
    `${rightPath(projectId, rightId)}/status`,
    rightResponse,
    input,
  );
export const deleteRight = (
  projectId: string,
  rightId: string,
  version: number,
) =>
  apiClient("DELETE", rightPath(projectId, rightId), z.undefined(), {
    version,
  });
export const rightDocuments = ownerDocumentApi(rightSchema);
