import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AttachNewOwnerDocumentInput,
  Budget,
  BudgetVersion,
  CreateBudgetDepartmentInput,
  CreateBudgetInput,
  CreateBudgetLineItemInput,
  UpdateBudgetDepartmentInput,
  UpdateBudgetLineItemInput,
} from "@shared/contracts";
import { ApiClientError } from "@/lib/api-client";
import { useVaultMutation } from "@/lib/mutations";
import { financingOverviewKey } from "@/features/financing-overview/use-financing-overview";
import { documentsKey } from "@/features/documents/use-documents";
import {
  createBudget,
  createBudgetDepartment,
  createBudgetLineItem,
  deleteBudgetDepartment,
  deleteBudgetLineItem,
  departmentDocuments,
  departmentPath,
  getBudget,
  getBudgetVersion,
  lockBudgetVersion,
  renameBudgetDepartment,
  startBudgetRevision,
  submitBudgetVersion,
  updateBudgetLineItem,
} from "./budget-api";

export const budgetKey = (projectId: string) => ["budget", projectId] as const;
export const budgetVersionKey = (projectId: string, versionId: string) =>
  ["budget", projectId, "version", versionId] as const;
const auditKey = ["audit-events"] as const;
/** Every content command returns the affected version; the budget and its history refetch too. */
const afterChange = ({ projectId }: { projectId: string }) => [
  budgetKey(projectId),
  financingOverviewKey(projectId),
  auditKey,
];
const afterDocumentChange = ({ projectId }: { projectId: string }) => [
  budgetKey(projectId),
  documentsKey(projectId),
  auditKey,
];

/**
 * Content commands return the affected version. Writing it into the budget
 * cache before the mutation resolves keeps every row's `version` fresh for the
 * user's next edit, instead of waiting for the invalidation refetch.
 */
function useVersionCache() {
  const queryClient = useQueryClient();
  return (projectId: string, result: { data: BudgetVersion }) => {
    queryClient.setQueryData<{ data: Budget } | null>(
      budgetKey(projectId),
      (cached) =>
        cached && cached.data.currentVersion.id === result.data.id
          ? { ...cached, data: { ...cached.data, currentVersion: result.data } }
          : cached,
    );
    return result;
  };
}

/** The project's budget; `null` data means no budget has been created yet. */
export function useBudget(projectId: string) {
  return useQuery({
    queryKey: budgetKey(projectId),
    queryFn: async () => {
      try {
        return await getBudget(projectId);
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404)
          return null;
        throw error;
      }
    },
  });
}

export function useBudgetVersion(projectId: string, versionId: string | null) {
  return useQuery({
    queryKey: budgetVersionKey(projectId, versionId ?? ""),
    queryFn: () => getBudgetVersion(projectId, versionId!),
    enabled: versionId !== null,
  });
}

export function useCreateBudget() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: CreateBudgetInput;
    }) => createBudget(projectId, input),
    invalidate: afterChange,
    successMessage: "Budget draft created.",
  });
}

export function useSubmitBudgetVersion() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      versionId,
      version,
    }: {
      projectId: string;
      versionId: string;
      version: number;
    }) => submitBudgetVersion(projectId, versionId, version),
    invalidate: afterChange,
    successMessage: "Budget submitted for approval.",
  });
}

export function useLockBudgetVersion() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      versionId,
      version,
    }: {
      projectId: string;
      versionId: string;
      version: number;
    }) => lockBudgetVersion(projectId, versionId, version),
    invalidate: afterChange,
    successMessage: "Budget approved and locked.",
  });
}

export function useStartBudgetRevision() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      fromVersionId,
    }: {
      projectId: string;
      fromVersionId: string;
    }) => startBudgetRevision(projectId, fromVersionId),
    invalidate: afterChange,
    successMessage: "New draft created from the locked budget.",
  });
}

export function useCreateBudgetDepartment() {
  const remember = useVersionCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      versionId,
      input,
    }: {
      projectId: string;
      versionId: string;
      input: CreateBudgetDepartmentInput;
    }) =>
      createBudgetDepartment(projectId, versionId, input).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
    successMessage: "Department added.",
  });
}

export function useRenameBudgetDepartment() {
  const remember = useVersionCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      departmentId,
      input,
    }: {
      projectId: string;
      departmentId: string;
      input: UpdateBudgetDepartmentInput;
    }) =>
      renameBudgetDepartment(projectId, departmentId, input).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
    successMessage: "Department renamed.",
  });
}

export function useDeleteBudgetDepartment() {
  const remember = useVersionCache();
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
      deleteBudgetDepartment(projectId, departmentId, version).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
    successMessage: "Department removed.",
  });
}

export function useCreateBudgetLineItem() {
  const remember = useVersionCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      departmentId,
      input,
    }: {
      projectId: string;
      departmentId: string;
      input: CreateBudgetLineItemInput;
    }) =>
      createBudgetLineItem(projectId, departmentId, input).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
  });
}

export function useUpdateBudgetLineItem() {
  const remember = useVersionCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      lineItemId,
      input,
    }: {
      projectId: string;
      lineItemId: string;
      input: UpdateBudgetLineItemInput;
    }) =>
      updateBudgetLineItem(projectId, lineItemId, input).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
  });
}

export function useDeleteBudgetLineItem() {
  const remember = useVersionCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      lineItemId,
      version,
    }: {
      projectId: string;
      lineItemId: string;
      version: number;
    }) =>
      deleteBudgetLineItem(projectId, lineItemId, version).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
    successMessage: "Line item removed.",
  });
}

export function useAttachNewDepartmentDocument() {
  const remember = useVersionCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      departmentId,
      input,
    }: {
      projectId: string;
      departmentId: string;
      input: AttachNewOwnerDocumentInput;
    }) =>
      departmentDocuments
        .attachNew(departmentPath(projectId, departmentId), input)
        .then((r) => remember(projectId, r)),
    invalidate: afterDocumentChange,
    successMessage: "Document attached.",
  });
}

export function useDetachDepartmentDocument() {
  const remember = useVersionCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      departmentId,
      documentId,
    }: {
      projectId: string;
      departmentId: string;
      documentId: string;
    }) =>
      departmentDocuments
        .detach(departmentPath(projectId, departmentId), documentId)
        .then((r) => remember(projectId, r)),
    invalidate: afterDocumentChange,
    successMessage: "Document detached.",
  });
}

/**
 * Field-by-field editing of one line item: commits for the same item run one
 * after another and each reads the item's latest `version` from the budget
 * cache at send time (the previous commit already wrote it there). Two users
 * editing the same line still conflict with 409; one user tabbing through a
 * row never does.
 */
export function useCommitLineItem(projectId: string) {
  const queryClient = useQueryClient();
  const update = useUpdateBudgetLineItem();
  const queues = useRef(new Map<string, Promise<unknown>>());
  return (
    lineItemId: string,
    changes: Omit<UpdateBudgetLineItemInput, "version">,
  ) => {
    let reportedError: unknown;
    const run = (): Promise<unknown> => {
      const cached = queryClient.getQueryData<{ data: Budget } | null>(
        budgetKey(projectId),
      );
      const item = cached?.data.currentVersion.departments
        .flatMap((d) => d.lineItems)
        .find((i) => i.id === lineItemId);
      if (!item) return Promise.resolve();
      return update
        .mutateAsync({
          projectId,
          lineItemId,
          input: { ...changes, version: item.version },
        })
        .catch((error: unknown) => {
          reportedError = error;
          return undefined; // the mutation hook toasts; the field learns below
        });
    };
    const next = (queues.current.get(lineItemId) ?? Promise.resolve()).then(
      run,
    );
    queues.current.set(lineItemId, next);
    // The queue itself never rejects (so later commits still run); the caller's
    // promise does, so the field can fall back to the authoritative value.
    return next.then(() => {
      if (reportedError !== undefined) throw reportedError;
    });
  };
}

/**
 * Renaming a department reads the department's latest `version` from the
 * budget cache at send time, the same rule as line-item commits, so a rename
 * typed after another edit landed never carries a stale render-time version.
 */
export function useCommitDepartmentName(projectId: string) {
  const queryClient = useQueryClient();
  const rename = useRenameBudgetDepartment();
  return (departmentId: string, name: string): Promise<unknown> => {
    const cached = queryClient.getQueryData<{ data: Budget } | null>(
      budgetKey(projectId),
    );
    const department = cached?.data.currentVersion.departments.find(
      (d) => d.id === departmentId,
    );
    if (!department)
      return Promise.reject(new Error("The department is no longer loaded."));
    return rename.mutateAsync({
      projectId,
      departmentId,
      input: { name, version: department.version },
    });
  };
}
