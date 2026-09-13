import {
  apiSuccessSchema,
  financePlanSchema,
  type ChangeFinanceSourceStatusInput,
  type CreateFinancePlanInput,
  type CreateFinanceSourceInput,
  type RebaseFinancePlanInput,
  type UpdateFinanceSourceInput,
} from "@shared/contracts";
import { apiClient } from "@/lib/api-client";
import { ownerDocumentApi } from "@/components/documents/owner-document-api";

const planResponse = apiSuccessSchema(financePlanSchema);
const base = (projectId: string) => `/projects/${projectId}/finance-plan`;

export const getFinancePlan = (projectId: string) =>
  apiClient("GET", base(projectId), planResponse);
export const createFinancePlan = (
  projectId: string,
  input: CreateFinancePlanInput,
) => apiClient("POST", base(projectId), planResponse, input);
export const rebaseFinancePlan = (
  projectId: string,
  input: RebaseFinancePlanInput,
) =>
  apiClient("POST", `${base(projectId)}/budget-version`, planResponse, input);
export const createFinanceSource = (
  projectId: string,
  input: CreateFinanceSourceInput,
) => apiClient("POST", `${base(projectId)}/sources`, planResponse, input);
export const updateFinanceSource = (
  projectId: string,
  sourceId: string,
  input: UpdateFinanceSourceInput,
) =>
  apiClient(
    "PATCH",
    `${base(projectId)}/sources/${sourceId}`,
    planResponse,
    input,
  );
export const changeFinanceSourceStatus = (
  projectId: string,
  sourceId: string,
  input: ChangeFinanceSourceStatusInput,
) =>
  apiClient(
    "POST",
    `${base(projectId)}/sources/${sourceId}/status`,
    planResponse,
    input,
  );
export const approveFinanceSource = (
  projectId: string,
  sourceId: string,
  version: number,
) =>
  apiClient(
    "POST",
    `${base(projectId)}/sources/${sourceId}/approve`,
    planResponse,
    { version },
  );
export const deleteFinanceSource = (
  projectId: string,
  sourceId: string,
  version: number,
) =>
  apiClient("DELETE", `${base(projectId)}/sources/${sourceId}`, planResponse, {
    version,
  });
export const sourceDocuments = ownerDocumentApi(financePlanSchema);
export const sourcePath = (projectId: string, sourceId: string) =>
  `${base(projectId)}/sources/${sourceId}`;
