import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AttachNewOwnerDocumentInput,
  ChangeDistributionTerritoryStatusInput,
  CreateDistributionTerritoryInput,
  CreateDistributionTerritoryNoteInput,
  DistributionTerritory,
  UpdateDistributionTerritoryInput,
  UpdateDistributionTerritoryNoteInput,
} from "@shared/contracts";
import { useVaultMutation } from "@/lib/mutations";
import { documentsKey } from "@/features/documents/use-documents";
import {
  changeTerritoryStatus,
  createTerritory,
  createTerritoryNote,
  deleteTerritory,
  deleteTerritoryNote,
  getTerritory,
  listTerritories,
  territoryDocuments,
  territoryPath,
  updateTerritory,
  updateTerritoryNote,
} from "./distribution-api";

export const territoriesKey = (projectId: string) =>
  ["distribution", projectId] as const;
export const territoryKey = (projectId: string, territoryId: string) =>
  [...territoriesKey(projectId), territoryId] as const;
const auditKey = ["audit-events"] as const;
/** The list holds counts and status, so every territory change refreshes it too. */
const afterChange = ({ projectId }: { projectId: string }) => [
  territoriesKey(projectId),
  auditKey,
];
const afterDocumentChange = ({ projectId }: { projectId: string }) => [
  territoriesKey(projectId),
  documentsKey(projectId),
  auditKey,
];

interface TerritoryRef {
  projectId: string;
  territoryId: string;
}

/** Commands return the whole territory; cache it so the next edit carries fresh versions. */
function useTerritoryCache() {
  const queryClient = useQueryClient();
  return (ref: TerritoryRef, result: { data: DistributionTerritory }) => {
    queryClient.setQueryData(
      territoryKey(ref.projectId, ref.territoryId),
      result,
    );
    return result;
  };
}

export function useTerritories(projectId: string) {
  return useQuery({
    queryKey: territoriesKey(projectId),
    queryFn: () => listTerritories(projectId),
  });
}

export function useTerritory(projectId: string, territoryId: string | null) {
  return useQuery({
    queryKey: territoryKey(projectId, territoryId ?? "none"),
    queryFn: () => getTerritory(projectId, territoryId!),
    enabled: territoryId !== null,
  });
}

export function useCreateTerritory() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: CreateDistributionTerritoryInput;
    }) => createTerritory(projectId, input),
    invalidate: afterChange,
    successMessage: "Territory added.",
  });
}

export function useUpdateTerritory() {
  const remember = useTerritoryCache();
  return useVaultMutation({
    mutationFn: (
      variables: TerritoryRef & { input: UpdateDistributionTerritoryInput },
    ) =>
      updateTerritory(
        variables.projectId,
        variables.territoryId,
        variables.input,
      ).then((r) => remember(variables, r)),
    invalidate: afterChange,
    successMessage: "Territory updated.",
  });
}

export function useChangeTerritoryStatus() {
  const remember = useTerritoryCache();
  return useVaultMutation({
    mutationFn: (
      variables: TerritoryRef & {
        input: ChangeDistributionTerritoryStatusInput;
      },
    ) =>
      changeTerritoryStatus(
        variables.projectId,
        variables.territoryId,
        variables.input,
      ).then((r) => remember(variables, r)),
    invalidate: afterChange,
    successMessage: "Status updated.",
  });
}

export function useDeleteTerritory() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      territoryId,
      version,
    }: TerritoryRef & { version: number }) =>
      deleteTerritory(projectId, territoryId, version),
    invalidate: afterChange,
    successMessage: "Territory deleted.",
  });
}

export function useCreateTerritoryNote() {
  const remember = useTerritoryCache();
  return useVaultMutation({
    mutationFn: (
      variables: TerritoryRef & { input: CreateDistributionTerritoryNoteInput },
    ) =>
      createTerritoryNote(
        variables.projectId,
        variables.territoryId,
        variables.input,
      ).then((r) => remember(variables, r)),
    invalidate: afterChange,
    successMessage: "Note added.",
  });
}

export function useUpdateTerritoryNote() {
  const remember = useTerritoryCache();
  return useVaultMutation({
    mutationFn: (
      variables: TerritoryRef & {
        noteId: string;
        input: UpdateDistributionTerritoryNoteInput;
      },
    ) =>
      updateTerritoryNote(
        variables.projectId,
        variables.territoryId,
        variables.noteId,
        variables.input,
      ).then((r) => remember(variables, r)),
    invalidate: afterChange,
    successMessage: "Note updated.",
  });
}

export function useDeleteTerritoryNote() {
  const remember = useTerritoryCache();
  return useVaultMutation({
    mutationFn: (
      variables: TerritoryRef & { noteId: string; version: number },
    ) =>
      deleteTerritoryNote(
        variables.projectId,
        variables.territoryId,
        variables.noteId,
        variables.version,
      ).then((r) => remember(variables, r)),
    invalidate: afterChange,
    successMessage: "Note deleted.",
  });
}

export function useAttachNewTerritoryDocument() {
  const remember = useTerritoryCache();
  return useVaultMutation({
    mutationFn: (
      variables: TerritoryRef & { input: AttachNewOwnerDocumentInput },
    ) =>
      territoryDocuments
        .attachNew(
          territoryPath(variables.projectId, variables.territoryId),
          variables.input,
        )
        .then((r) => remember(variables, r)),
    invalidate: afterDocumentChange,
    successMessage: "Document attached.",
  });
}

export function useDetachTerritoryDocument() {
  const remember = useTerritoryCache();
  return useVaultMutation({
    mutationFn: (variables: TerritoryRef & { documentId: string }) =>
      territoryDocuments
        .detach(
          territoryPath(variables.projectId, variables.territoryId),
          variables.documentId,
        )
        .then((r) => remember(variables, r)),
    invalidate: afterDocumentChange,
    successMessage: "Document detached.",
  });
}
