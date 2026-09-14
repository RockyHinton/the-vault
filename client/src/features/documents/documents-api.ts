import {
  apiSuccessSchema,
  documentSchema,
  type AddDocumentVersionInput,
  type CreateDocumentInput,
  type DocumentFolder,
  type UpdateDocumentInput,
} from "@shared/contracts";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";

const documentResponse = apiSuccessSchema(documentSchema);
const documentListResponse = apiSuccessSchema(
  z.object({ items: z.array(documentSchema) }),
);

const base = (projectId: string) => `/projects/${projectId}/documents`;

export const listDocuments = (projectId: string, folder?: DocumentFolder) =>
  apiClient(
    "GET",
    `${base(projectId)}${folder ? `?folder=${encodeURIComponent(folder)}` : ""}`,
    documentListResponse,
  );
export const createDocument = (projectId: string, input: CreateDocumentInput) =>
  apiClient("POST", base(projectId), documentResponse, input);
export const addDocumentVersion = (
  projectId: string,
  documentId: string,
  input: AddDocumentVersionInput,
) =>
  apiClient(
    "POST",
    `${base(projectId)}/${documentId}/versions`,
    documentResponse,
    input,
  );
export const updateDocument = (
  projectId: string,
  documentId: string,
  input: UpdateDocumentInput,
) =>
  apiClient(
    "PATCH",
    `${base(projectId)}/${documentId}`,
    documentResponse,
    input,
  );
export const deleteDocument = (
  projectId: string,
  documentId: string,
  version: number,
) =>
  apiClient("DELETE", `${base(projectId)}/${documentId}`, z.undefined(), {
    version,
  });
