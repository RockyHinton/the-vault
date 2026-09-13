import {
  apiSuccessSchema,
  budgetSchema,
  budgetVersionSchema,
  type CreateBudgetDepartmentInput,
  type CreateBudgetInput,
  type CreateBudgetLineItemInput,
  type UpdateBudgetDepartmentInput,
  type UpdateBudgetLineItemInput,
} from "@shared/contracts";
import { apiClient } from "@/lib/api-client";
import { ownerDocumentApi } from "@/components/documents/owner-document-api";

const budgetResponse = apiSuccessSchema(budgetSchema);
const versionResponse = apiSuccessSchema(budgetVersionSchema);
const base = (projectId: string) => `/projects/${projectId}/budget`;

export const getBudget = (projectId: string) =>
  apiClient("GET", base(projectId), budgetResponse);
export const getBudgetVersion = (projectId: string, versionId: string) =>
  apiClient("GET", `${base(projectId)}/versions/${versionId}`, versionResponse);
export const createBudget = (projectId: string, input: CreateBudgetInput) =>
  apiClient("POST", base(projectId), budgetResponse, input);
export const submitBudgetVersion = (
  projectId: string,
  versionId: string,
  version: number,
) =>
  apiClient(
    "POST",
    `${base(projectId)}/versions/${versionId}/submit`,
    budgetResponse,
    { version },
  );
export const lockBudgetVersion = (
  projectId: string,
  versionId: string,
  version: number,
) =>
  apiClient(
    "POST",
    `${base(projectId)}/versions/${versionId}/lock`,
    budgetResponse,
    { version },
  );
export const startBudgetRevision = (projectId: string, fromVersionId: string) =>
  apiClient(
    "POST",
    `${base(projectId)}/versions/${fromVersionId}/revisions`,
    budgetResponse,
  );

export const createBudgetDepartment = (
  projectId: string,
  versionId: string,
  input: CreateBudgetDepartmentInput,
) =>
  apiClient(
    "POST",
    `${base(projectId)}/versions/${versionId}/departments`,
    versionResponse,
    input,
  );
export const renameBudgetDepartment = (
  projectId: string,
  departmentId: string,
  input: UpdateBudgetDepartmentInput,
) =>
  apiClient(
    "PATCH",
    `${base(projectId)}/departments/${departmentId}`,
    versionResponse,
    input,
  );
export const deleteBudgetDepartment = (
  projectId: string,
  departmentId: string,
) =>
  apiClient(
    "DELETE",
    `${base(projectId)}/departments/${departmentId}`,
    versionResponse,
  );

export const createBudgetLineItem = (
  projectId: string,
  departmentId: string,
  input: CreateBudgetLineItemInput,
) =>
  apiClient(
    "POST",
    `${base(projectId)}/departments/${departmentId}/line-items`,
    versionResponse,
    input,
  );
export const updateBudgetLineItem = (
  projectId: string,
  lineItemId: string,
  input: UpdateBudgetLineItemInput,
) =>
  apiClient(
    "PATCH",
    `${base(projectId)}/line-items/${lineItemId}`,
    versionResponse,
    input,
  );
export const deleteBudgetLineItem = (
  projectId: string,
  lineItemId: string,
  version: number,
) =>
  apiClient(
    "DELETE",
    `${base(projectId)}/line-items/${lineItemId}`,
    versionResponse,
    { version },
  );

/** Department documents follow the owner convention; the owner path is the department. */
export const departmentDocuments = ownerDocumentApi(budgetVersionSchema);
export const departmentPath = (projectId: string, departmentId: string) =>
  `${base(projectId)}/departments/${departmentId}`;
