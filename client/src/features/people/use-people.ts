import { useQuery } from "@tanstack/react-query";
import type {
  AttachNewPersonDocumentInput,
  ChangePersonStatusInput,
  CreatePersonInput,
  PersonKind,
  UpdatePersonInput,
} from "@shared/contracts";
import { useVaultMutation } from "@/lib/mutations";
import { documentsKey } from "@/features/documents/use-documents";
import {
  attachExistingPersonDocument,
  attachNewPersonDocument,
  changePersonStatus,
  createPerson,
  deletePerson,
  detachPersonDocument,
  listPeople,
  updatePerson,
} from "./people-api";

export const peopleKey = (projectId: string) => ["people", projectId] as const;
const auditKey = ["audit-events"] as const;
const afterChange = ({ projectId }: { projectId: string }) => [
  peopleKey(projectId),
  auditKey,
];
/** Attachment commands also change the document library. */
const afterDocumentChange = ({ projectId }: { projectId: string }) => [
  peopleKey(projectId),
  documentsKey(projectId),
  auditKey,
];

interface PersonRef {
  projectId: string;
  personId: string;
}

export function usePeople(projectId: string, kind?: PersonKind) {
  return useQuery({
    queryKey: [...peopleKey(projectId), kind ?? "all"],
    queryFn: () => listPeople(projectId, kind),
  });
}

export function useCreatePerson() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: CreatePersonInput;
    }) => createPerson(projectId, input),
    invalidate: afterChange,
    successMessage: "Profile added.",
  });
}

export function useUpdatePerson() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      personId,
      input,
    }: PersonRef & { input: UpdatePersonInput }) =>
      updatePerson(projectId, personId, input),
    invalidate: afterChange,
    successMessage: "Profile updated.",
  });
}

export function useChangePersonStatus() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      personId,
      input,
    }: PersonRef & { input: ChangePersonStatusInput }) =>
      changePersonStatus(projectId, personId, input),
    invalidate: afterChange,
    successMessage: "Status updated.",
  });
}

export function useDeletePerson() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      personId,
      version,
    }: PersonRef & { version: number }) =>
      deletePerson(projectId, personId, version),
    invalidate: afterChange,
    successMessage: "Profile removed.",
  });
}

export function useAttachNewPersonDocument() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      personId,
      input,
    }: PersonRef & { input: AttachNewPersonDocumentInput }) =>
      attachNewPersonDocument(projectId, personId, input),
    invalidate: afterDocumentChange,
    successMessage: "Document attached.",
  });
}

export function useAttachExistingPersonDocument() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      personId,
      documentId,
    }: PersonRef & { documentId: string }) =>
      attachExistingPersonDocument(projectId, personId, documentId),
    invalidate: afterDocumentChange,
    successMessage: "Document attached.",
  });
}

export function useDetachPersonDocument() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      personId,
      documentId,
    }: PersonRef & { documentId: string }) =>
      detachPersonDocument(projectId, personId, documentId),
    invalidate: afterDocumentChange,
    successMessage: "Document detached.",
  });
}
