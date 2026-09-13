import { useQuery } from "@tanstack/react-query";
import type {
  AttachNewOwnerDocumentInput,
  ChangeRightStatusInput,
  CreateRightInput,
  UpdateRightInput,
} from "@shared/contracts";
import { useVaultMutation } from "@/lib/mutations";
import { documentsKey } from "@/features/documents/use-documents";
import {
  changeRightStatus,
  createRight,
  deleteRight,
  listRights,
  rightDocuments,
  rightPath,
  updateRight,
} from "./rights-api";

export const rightsKey = (projectId: string) => ["rights", projectId] as const;
const auditKey = ["audit-events"] as const;
const afterChange = ({ projectId }: { projectId: string }) => [
  rightsKey(projectId),
  auditKey,
];
const afterDocumentChange = ({ projectId }: { projectId: string }) => [
  rightsKey(projectId),
  documentsKey(projectId),
  auditKey,
];

interface RightRef {
  projectId: string;
  rightId: string;
}

export function useRights(projectId: string) {
  return useQuery({
    queryKey: rightsKey(projectId),
    queryFn: () => listRights(projectId),
  });
}

export function useCreateRight() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: CreateRightInput;
    }) => createRight(projectId, input),
    invalidate: afterChange,
    successMessage: "Rights item added.",
  });
}

export function useUpdateRight() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      rightId,
      input,
    }: RightRef & { input: UpdateRightInput }) =>
      updateRight(projectId, rightId, input),
    invalidate: afterChange,
    successMessage: "Rights item saved.",
  });
}

export function useChangeRightStatus() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      rightId,
      input,
    }: RightRef & { input: ChangeRightStatusInput }) =>
      changeRightStatus(projectId, rightId, input),
    invalidate: afterChange,
    successMessage: "Status updated.",
  });
}

export function useDeleteRight() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      rightId,
      version,
    }: RightRef & { version: number }) =>
      deleteRight(projectId, rightId, version),
    invalidate: afterChange,
    successMessage: "Rights item removed.",
  });
}

export function useAttachNewRightDocument() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      rightId,
      input,
    }: RightRef & { input: AttachNewOwnerDocumentInput }) =>
      rightDocuments.attachNew(rightPath(projectId, rightId), input),
    invalidate: afterDocumentChange,
    successMessage: "Document attached.",
  });
}

export function useDetachRightDocument() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      rightId,
      documentId,
    }: RightRef & { documentId: string }) =>
      rightDocuments.detach(rightPath(projectId, rightId), documentId),
    invalidate: afterDocumentChange,
    successMessage: "Document detached.",
  });
}
