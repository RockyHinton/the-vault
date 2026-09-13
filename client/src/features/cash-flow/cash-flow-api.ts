import {
  apiSuccessSchema,
  cashFlowSchema,
  type CreateCashFlowPaymentInput,
  type SetCashFlowDepartmentWindowInput,
  type SetCashFlowSourceTimingInput,
  type UpdateCashFlowInput,
  type UpdateCashFlowPaymentInput,
} from "@shared/contracts";
import { apiClient } from "@/lib/api-client";

const response = apiSuccessSchema(cashFlowSchema);
const base = (projectId: string) => `/projects/${projectId}/cash-flow`;

export const getCashFlow = (projectId: string) =>
  apiClient("GET", base(projectId), response);
export const createCashFlow = (projectId: string) =>
  apiClient("POST", base(projectId), response, {});
export const updateCashFlow = (projectId: string, input: UpdateCashFlowInput) =>
  apiClient("PATCH", base(projectId), response, input);
export const setDepartmentWindow = (
  projectId: string,
  departmentId: string,
  input: SetCashFlowDepartmentWindowInput,
) =>
  apiClient(
    "PUT",
    `${base(projectId)}/departments/${departmentId}/window`,
    response,
    input,
  );
export const clearDepartmentWindow = (
  projectId: string,
  departmentId: string,
  version: number,
) =>
  apiClient(
    "DELETE",
    `${base(projectId)}/departments/${departmentId}/window`,
    response,
    { version },
  );
export const createPayment = (
  projectId: string,
  input: CreateCashFlowPaymentInput,
) => apiClient("POST", `${base(projectId)}/payments`, response, input);
export const updatePayment = (
  projectId: string,
  paymentId: string,
  input: UpdateCashFlowPaymentInput,
) =>
  apiClient(
    "PATCH",
    `${base(projectId)}/payments/${paymentId}`,
    response,
    input,
  );
export const deletePayment = (
  projectId: string,
  paymentId: string,
  version: number,
) =>
  apiClient("DELETE", `${base(projectId)}/payments/${paymentId}`, response, {
    version,
  });
export const setSourceTiming = (
  projectId: string,
  sourceId: string,
  input: SetCashFlowSourceTimingInput,
) =>
  apiClient(
    "PUT",
    `${base(projectId)}/sources/${sourceId}/timing`,
    response,
    input,
  );
export const clearSourceTiming = (
  projectId: string,
  sourceId: string,
  version: number,
) =>
  apiClient(
    "DELETE",
    `${base(projectId)}/sources/${sourceId}/timing`,
    response,
    { version },
  );
