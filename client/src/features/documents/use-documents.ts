import { useQuery } from "@tanstack/react-query";
import type {
  AddDocumentVersionInput,
  CreateDocumentInput,
  DocumentFolder,
  UpdateDocumentInput,
} from "@shared/contracts";
import { useVaultMutation } from "@/lib/mutations";
import {
  addDocumentVersion,
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocument,
} from "./documents-api";

export const documentsKey = (projectId: string) =>
  ["documents", projectId] as const;
const documentKey = (projectId: string, documentId: string) =>
  ["documents", projectId, "item", documentId] as const;
const auditKey = ["audit-events"] as const;

export function useDocuments(projectId: string, folder?: DocumentFolder) {
  return useQuery({
    queryKey: [...documentsKey(projectId), "list", folder ?? "all"],
    queryFn: () => listDocuments(projectId, folder),
  });
}

export function useDocument(projectId: string, documentId: string | undefined) {
  return useQuery({
    queryKey: documentKey(projectId, documentId ?? ""),
    queryFn: () => getDocument(projectId, documentId!),
    enabled: Boolean(documentId),
  });
}

const afterChange = (variables: { projectId: string }) => [
  documentsKey(variables.projectId),
  auditKey,
];

export function useCreateDocument() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: CreateDocumentInput;
    }) => createDocument(projectId, input),
    invalidate: afterChange,
    successMessage: "Document added.",
  });
}

export function useAddDocumentVersion() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      documentId,
      input,
    }: {
      projectId: string;
      documentId: string;
      input: AddDocumentVersionInput;
    }) => addDocumentVersion(projectId, documentId, input),
    invalidate: afterChange,
    successMessage: (result) => `Version ${result.data.versionNumber} added.`,
  });
}

export function useUpdateDocument() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      documentId,
      input,
    }: {
      projectId: string;
      documentId: string;
      input: UpdateDocumentInput;
    }) => updateDocument(projectId, documentId, input),
    invalidate: afterChange,
    successMessage: "Document updated.",
  });
}

export function useDeleteDocument() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      documentId,
      version,
    }: {
      projectId: string;
      documentId: string;
      version: number;
    }) => deleteDocument(projectId, documentId, version),
    invalidate: afterChange,
    successMessage: "Document deleted.",
  });
}
