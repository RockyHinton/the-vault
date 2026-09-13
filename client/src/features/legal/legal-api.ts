import {
  apiSuccessSchema,
  legalRecordSchema,
  type CreateLegalRecordInput,
  type LegalCategory,
  type UpdateLegalRecordInput,
} from "@shared/contracts";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";
import { ownerDocumentApi } from "@/components/documents/owner-document-api";

const recordResponse = apiSuccessSchema(legalRecordSchema);
const recordListResponse = apiSuccessSchema(
  z.object({ items: z.array(legalRecordSchema) }),
);
export const legalRecordPath = (projectId: string, recordId?: string) =>
  `/projects/${projectId}/legal-records${recordId ? `/${recordId}` : ""}`;

export const listLegalRecords = (projectId: string, category?: LegalCategory) =>
  apiClient(
    "GET",
    `${legalRecordPath(projectId)}${category ? `?category=${category}` : ""}`,
    recordListResponse,
  );
export const createLegalRecord = (
  projectId: string,
  input: CreateLegalRecordInput,
) => apiClient("POST", legalRecordPath(projectId), recordResponse, input);
export const updateLegalRecord = (
  projectId: string,
  recordId: string,
  input: UpdateLegalRecordInput,
) =>
  apiClient(
    "PATCH",
    legalRecordPath(projectId, recordId),
    recordResponse,
    input,
  );
export const deleteLegalRecord = (
  projectId: string,
  recordId: string,
  version: number,
) =>
  apiClient("DELETE", legalRecordPath(projectId, recordId), z.undefined(), {
    version,
  });
export const legalRecordDocuments = ownerDocumentApi(legalRecordSchema);
