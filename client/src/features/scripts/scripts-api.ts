import {
  apiSuccessSchema,
  scriptAnnotationSchema,
  scriptDetailSchema,
  scriptSchema,
  type AddScriptVersionInput,
  type CreateScriptAnnotationInput,
  type CreateScriptInput,
  type UpdateScriptAnnotationInput,
} from "@shared/contracts";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";

const scriptListResponse = apiSuccessSchema(
  z.object({ items: z.array(scriptSchema) }),
);
const scriptDetailResponse = apiSuccessSchema(scriptDetailSchema);
const annotationResponse = apiSuccessSchema(scriptAnnotationSchema);
const annotationListResponse = apiSuccessSchema(
  z.object({ items: z.array(scriptAnnotationSchema) }),
);
const base = (projectId: string, scriptId?: string) =>
  `/projects/${projectId}/scripts${scriptId ? `/${scriptId}` : ""}`;

export const listScripts = (projectId: string) =>
  apiClient("GET", base(projectId), scriptListResponse);
export const getScript = (projectId: string, scriptId: string) =>
  apiClient("GET", base(projectId, scriptId), scriptDetailResponse);
export const createScript = (projectId: string, input: CreateScriptInput) =>
  apiClient("POST", base(projectId), scriptDetailResponse, input);
export const addScriptVersion = (
  projectId: string,
  scriptId: string,
  input: AddScriptVersionInput,
) =>
  apiClient(
    "POST",
    `${base(projectId, scriptId)}/versions`,
    scriptDetailResponse,
    input,
  );
export const deleteScript = (projectId: string, scriptId: string) =>
  apiClient("DELETE", base(projectId, scriptId), z.undefined());

export const listAnnotations = (
  projectId: string,
  scriptId: string,
  documentId: string,
) =>
  apiClient(
    "GET",
    `${base(projectId, scriptId)}/versions/${documentId}/annotations`,
    annotationListResponse,
  );
export const createAnnotation = (
  projectId: string,
  scriptId: string,
  documentId: string,
  input: CreateScriptAnnotationInput,
) =>
  apiClient(
    "POST",
    `${base(projectId, scriptId)}/versions/${documentId}/annotations`,
    annotationResponse,
    input,
  );
export const updateAnnotation = (
  projectId: string,
  scriptId: string,
  annotationId: string,
  input: UpdateScriptAnnotationInput,
) =>
  apiClient(
    "PATCH",
    `${base(projectId, scriptId)}/annotations/${annotationId}`,
    annotationResponse,
    input,
  );
export const deleteAnnotation = (
  projectId: string,
  scriptId: string,
  annotationId: string,
  version: number,
) =>
  apiClient(
    "DELETE",
    `${base(projectId, scriptId)}/annotations/${annotationId}`,
    z.undefined(),
    {
      version,
    },
  );
