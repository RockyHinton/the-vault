import { useQuery } from "@tanstack/react-query";
import type {
  AttachNewOwnerDocumentInput,
  CreateLegalRecordInput,
  LegalCategory,
  UpdateLegalRecordInput,
} from "@shared/contracts";
import { useVaultMutation } from "@/lib/mutations";
import { documentsKey } from "@/features/documents/use-documents";
import {
  createLegalRecord,
  deleteLegalRecord,
  legalRecordDocuments,
  legalRecordPath,
  listLegalRecords,
  updateLegalRecord,
} from "./legal-api";

export const legalRecordsKey = (projectId: string) =>
  ["legal-records", projectId] as const;
const auditKey = ["audit-events"] as const;
const afterChange = ({ projectId }: { projectId: string }) => [
  legalRecordsKey(projectId),
  auditKey,
];
const afterDocumentChange = ({ projectId }: { projectId: string }) => [
  legalRecordsKey(projectId),
  documentsKey(projectId),
  auditKey,
];

interface RecordRef {
  projectId: string;
  recordId: string;
}

/** All records, or one category; the overview derives from the full list. */
export function useLegalRecords(projectId: string, category?: LegalCategory) {
  return useQuery({
    queryKey: [...legalRecordsKey(projectId), category ?? "all"],
    queryFn: () => listLegalRecords(projectId, category),
  });
}

export function useCreateLegalRecord() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: CreateLegalRecordInput;
    }) => createLegalRecord(projectId, input),
    invalidate: afterChange,
    successMessage: "Record added.",
  });
}

export function useUpdateLegalRecord() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      recordId,
      input,
    }: RecordRef & { input: UpdateLegalRecordInput }) =>
      updateLegalRecord(projectId, recordId, input),
    invalidate: afterChange,
    successMessage: "Record saved.",
  });
}

export function useDeleteLegalRecord() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      recordId,
      version,
    }: RecordRef & { version: number }) =>
      deleteLegalRecord(projectId, recordId, version),
    invalidate: afterChange,
    successMessage: "Record removed.",
  });
}

export function useAttachNewLegalDocument() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      recordId,
      input,
    }: RecordRef & { input: AttachNewOwnerDocumentInput }) =>
      legalRecordDocuments.attachNew(
        legalRecordPath(projectId, recordId),
        input,
      ),
    invalidate: afterDocumentChange,
    successMessage: "Document attached.",
  });
}

export function useDetachLegalDocument() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      recordId,
      documentId,
    }: RecordRef & { documentId: string }) =>
      legalRecordDocuments.detach(
        legalRecordPath(projectId, recordId),
        documentId,
      ),
    invalidate: afterDocumentChange,
    successMessage: "Document detached.",
  });
}
