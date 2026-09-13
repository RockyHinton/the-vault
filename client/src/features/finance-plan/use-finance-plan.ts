import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AttachNewOwnerDocumentInput,
  ChangeFinanceSourceStatusInput,
  CreateFinancePlanInput,
  CreateFinanceSourceInput,
  FinancePlan,
  RebaseFinancePlanInput,
  UpdateFinanceSourceInput,
} from "@shared/contracts";
import { ApiClientError } from "@/lib/api-client";
import { useVaultMutation } from "@/lib/mutations";
import { documentsKey } from "@/features/documents/use-documents";
import {
  approveFinanceSource,
  changeFinanceSourceStatus,
  createFinancePlan,
  createFinanceSource,
  deleteFinanceSource,
  getFinancePlan,
  rebaseFinancePlan,
  sourceDocuments,
  sourcePath,
  updateFinanceSource,
} from "./finance-plan-api";

export const financePlanKey = (projectId: string) =>
  ["finance-plan", projectId] as const;
const auditKey = ["audit-events"] as const;
const afterChange = ({ projectId }: { projectId: string }) => [
  financePlanKey(projectId),
  auditKey,
];
const afterDocumentChange = ({ projectId }: { projectId: string }) => [
  financePlanKey(projectId),
  documentsKey(projectId),
  auditKey,
];

interface SourceRef {
  projectId: string;
  sourceId: string;
}

/** Every command returns the whole plan; cache it immediately so the next edit sees fresh versions. */
function usePlanCache() {
  const queryClient = useQueryClient();
  return (projectId: string, result: { data: FinancePlan }) => {
    queryClient.setQueryData<{ data: FinancePlan } | null>(
      financePlanKey(projectId),
      result,
    );
    return result;
  };
}

/** The project's finance plan; `null` data means none has been created yet. */
export function useFinancePlan(projectId: string) {
  return useQuery({
    queryKey: financePlanKey(projectId),
    queryFn: async () => {
      try {
        return await getFinancePlan(projectId);
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404)
          return null;
        throw error;
      }
    },
  });
}

export function useCreateFinancePlan() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: CreateFinancePlanInput;
    }) => createFinancePlan(projectId, input),
    invalidate: afterChange,
    successMessage: "Finance plan created.",
  });
}

export function useRebaseFinancePlan() {
  const remember = usePlanCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: RebaseFinancePlanInput;
    }) =>
      rebaseFinancePlan(projectId, input).then((r) => remember(projectId, r)),
    invalidate: afterChange,
    successMessage: "Finance plan now finances the selected budget version.",
  });
}

export function useCreateFinanceSource() {
  const remember = usePlanCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: CreateFinanceSourceInput;
    }) =>
      createFinanceSource(projectId, input).then((r) => remember(projectId, r)),
    invalidate: afterChange,
    successMessage: "Funding source added.",
  });
}

export function useUpdateFinanceSource() {
  const remember = usePlanCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      sourceId,
      input,
    }: SourceRef & { input: UpdateFinanceSourceInput }) =>
      updateFinanceSource(projectId, sourceId, input).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
  });
}

export function useChangeFinanceSourceStatus() {
  const remember = usePlanCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      sourceId,
      input,
    }: SourceRef & { input: ChangeFinanceSourceStatusInput }) =>
      changeFinanceSourceStatus(projectId, sourceId, input).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
    successMessage: "Source status updated.",
  });
}

export function useApproveFinanceSource() {
  const remember = usePlanCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      sourceId,
      version,
    }: SourceRef & { version: number }) =>
      approveFinanceSource(projectId, sourceId, version).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
    successMessage: "Source approved and locked.",
  });
}

export function useDeleteFinanceSource() {
  const remember = usePlanCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      sourceId,
      version,
    }: SourceRef & { version: number }) =>
      deleteFinanceSource(projectId, sourceId, version).then((r) =>
        remember(projectId, r),
      ),
    invalidate: afterChange,
    successMessage: "Funding source removed.",
  });
}

export function useAttachNewSourceDocument() {
  const remember = usePlanCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      sourceId,
      input,
    }: SourceRef & { input: AttachNewOwnerDocumentInput }) =>
      sourceDocuments
        .attachNew(sourcePath(projectId, sourceId), input)
        .then((r) => remember(projectId, r)),
    invalidate: afterDocumentChange,
    successMessage: "Document attached.",
  });
}

export function useDetachSourceDocument() {
  const remember = usePlanCache();
  return useVaultMutation({
    mutationFn: ({
      projectId,
      sourceId,
      documentId,
    }: SourceRef & { documentId: string }) =>
      sourceDocuments
        .detach(sourcePath(projectId, sourceId), documentId)
        .then((r) => remember(projectId, r)),
    invalidate: afterDocumentChange,
    successMessage: "Document detached.",
  });
}

/**
 * Field-by-field editing of one source: commits for the same source run in
 * order and read its latest `version` from the plan cache at send time, the
 * same pattern as budget line items.
 */
export function useCommitFinanceSource(projectId: string) {
  const queryClient = useQueryClient();
  const update = useUpdateFinanceSource();
  const queues = useRef(new Map<string, Promise<unknown>>());
  return (
    sourceId: string,
    changes: Omit<UpdateFinanceSourceInput, "version">,
  ) => {
    const run = (): Promise<unknown> => {
      const cached = queryClient.getQueryData<{ data: FinancePlan } | null>(
        financePlanKey(projectId),
      );
      const source = cached?.data.sources.find((s) => s.id === sourceId);
      if (!source) return Promise.resolve();
      return update
        .mutateAsync({
          projectId,
          sourceId,
          input: { ...changes, version: source.version },
        })
        .catch(() => undefined);
    };
    const next = (queues.current.get(sourceId) ?? Promise.resolve()).then(run);
    queues.current.set(sourceId, next);
  };
}
