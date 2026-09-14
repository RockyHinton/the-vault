import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CashFlow,
  CreateCashFlowPaymentInput,
  SetCashFlowDepartmentWindowInput,
  SetCashFlowSourceTimingInput,
  UpdateCashFlowInput,
  UpdateCashFlowPaymentInput,
} from "@shared/contracts";
import { ApiClientError } from "@/lib/api-client";
import { useVaultMutation } from "@/lib/mutations";
import { financingOverviewKey } from "@/features/financing-overview/use-financing-overview";
import {
  clearDepartmentWindow,
  clearSourceTiming,
  createCashFlow,
  createPayment,
  deletePayment,
  getCashFlow,
  setDepartmentWindow,
  setSourceTiming,
  updateCashFlow,
  updatePayment,
} from "./cash-flow-api";

export const cashFlowKey = (projectId: string) =>
  ["cash-flow", projectId] as const;
const auditKey = ["audit-events"] as const;
const afterChange = ({ projectId }: { projectId: string }) => [
  cashFlowKey(projectId),
  financingOverviewKey(projectId),
  auditKey,
];

/** Every command returns the whole cash flow; cache it so the next edit carries fresh versions. */
function useCashFlowCache() {
  const queryClient = useQueryClient();
  return (projectId: string, result: { data: CashFlow }) => {
    queryClient.setQueryData<{ data: CashFlow } | null>(
      cashFlowKey(projectId),
      result,
    );
    return result;
  };
}

/** The project's cash flow; `null` data means none has been created yet. */
export function useCashFlow(projectId: string) {
  return useQuery({
    queryKey: cashFlowKey(projectId),
    queryFn: async () => {
      try {
        return await getCashFlow(projectId);
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404)
          return null;
        throw error;
      }
    },
  });
}

export function useCreateCashFlow() {
  return useVaultMutation({
    mutationFn: ({ projectId }: { projectId: string }) =>
      createCashFlow(projectId),
    invalidate: afterChange,
    successMessage: "Cash flow started.",
  });
}

export function useUpdateCashFlow() {
  const remember = useCashFlowCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: UpdateCashFlowInput;
    }) => updateCashFlow(projectId, input).then((r) => remember(projectId, r)),
    invalidate: afterChange,
  });
}

export function useSetDepartmentWindow() {
  const remember = useCashFlowCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      departmentId,
      input,
    }: {
      projectId: string;
      departmentId: string;
      input: SetCashFlowDepartmentWindowInput;
    }) =>
      setDepartmentWindow(projectId, departmentId, input).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
  });
}

export function useClearDepartmentWindow() {
  const remember = useCashFlowCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      departmentId,
      version,
    }: {
      projectId: string;
      departmentId: string;
      version: number;
    }) =>
      clearDepartmentWindow(projectId, departmentId, version).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
    successMessage: "Spend window cleared.",
  });
}

export function useCreatePayment() {
  const remember = useCashFlowCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: CreateCashFlowPaymentInput;
    }) => createPayment(projectId, input).then((r) => remember(projectId, r)),
    invalidate: afterChange,
    successMessage: "Payment added.",
  });
}

export function useUpdatePayment() {
  const remember = useCashFlowCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      paymentId,
      input,
    }: {
      projectId: string;
      paymentId: string;
      input: UpdateCashFlowPaymentInput;
    }) =>
      updatePayment(projectId, paymentId, input).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
  });
}

export function useDeletePayment() {
  const remember = useCashFlowCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      paymentId,
      version,
    }: {
      projectId: string;
      paymentId: string;
      version: number;
    }) =>
      deletePayment(projectId, paymentId, version).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
    successMessage: "Payment removed.",
  });
}

export function useSetSourceTiming() {
  const remember = useCashFlowCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      sourceId,
      input,
    }: {
      projectId: string;
      sourceId: string;
      input: SetCashFlowSourceTimingInput;
    }) =>
      setSourceTiming(projectId, sourceId, input).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
  });
}

export function useClearSourceTiming() {
  const remember = useCashFlowCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      sourceId,
      version,
    }: {
      projectId: string;
      sourceId: string;
      version: number;
    }) =>
      clearSourceTiming(projectId, sourceId, version).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
    successMessage: "Timing reset to the finance plan date.",
  });
}

/**
 * Opening balance and timeframe edits read the cash flow's latest `version`
 * from the cache at send time, so a field committed after another change
 * landed never carries a stale render-time version.
 */
export function useCommitCashFlowSettings(projectId: string) {
  const queryClient = useQueryClient();
  const update = useUpdateCashFlow();
  return (changes: Omit<UpdateCashFlowInput, "version">): Promise<unknown> => {
    const cached = queryClient.getQueryData<{ data: CashFlow } | null>(
      cashFlowKey(projectId),
    );
    if (!cached)
      return Promise.reject(new Error("The cash flow is no longer loaded."));
    return update.mutateAsync({
      projectId,
      input: { ...changes, version: cached.data.version },
    });
  };
}
