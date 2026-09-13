import {
  apiSuccessSchema,
  personSchema,
  type AttachNewPersonDocumentInput,
  type ChangePersonStatusInput,
  type CreatePersonInput,
  type PersonKind,
  type UpdatePersonInput,
} from "@shared/contracts";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";

const personResponse = apiSuccessSchema(personSchema);
const personListResponse = apiSuccessSchema(
  z.object({ items: z.array(personSchema) }),
);
const base = (projectId: string) => `/projects/${projectId}/people`;

export const listPeople = (projectId: string, kind?: PersonKind) =>
  apiClient(
    "GET",
    `${base(projectId)}${kind ? `?kind=${kind}` : ""}`,
    personListResponse,
  );
export const createPerson = (projectId: string, input: CreatePersonInput) =>
  apiClient("POST", base(projectId), personResponse, input);
export const updatePerson = (
  projectId: string,
  personId: string,
  input: UpdatePersonInput,
) =>
  apiClient("PATCH", `${base(projectId)}/${personId}`, personResponse, input);
export const changePersonStatus = (
  projectId: string,
  personId: string,
  input: ChangePersonStatusInput,
) =>
  apiClient(
    "POST",
    `${base(projectId)}/${personId}/status`,
    personResponse,
    input,
  );
export const deletePerson = (
  projectId: string,
  personId: string,
  version: number,
) =>
  apiClient("DELETE", `${base(projectId)}/${personId}`, z.undefined(), {
    version,
  });
export const attachNewPersonDocument = (
  projectId: string,
  personId: string,
  input: AttachNewPersonDocumentInput,
) =>
  apiClient(
    "POST",
    `${base(projectId)}/${personId}/documents`,
    personResponse,
    input,
  );
export const attachExistingPersonDocument = (
  projectId: string,
  personId: string,
  documentId: string,
) =>
  apiClient(
    "PUT",
    `${base(projectId)}/${personId}/documents/${documentId}`,
    personResponse,
  );
export const detachPersonDocument = (
  projectId: string,
  personId: string,
  documentId: string,
) =>
  apiClient(
    "DELETE",
    `${base(projectId)}/${personId}/documents/${documentId}`,
    personResponse,
  );
