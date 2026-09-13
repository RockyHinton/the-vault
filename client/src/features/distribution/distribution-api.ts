import { z } from "zod";
import {
  apiSuccessSchema,
  distributionTerritoryListSchema,
  distributionTerritorySchema,
  type ChangeDistributionTerritoryStatusInput,
  type CreateDistributionTerritoryInput,
  type CreateDistributionTerritoryNoteInput,
  type UpdateDistributionTerritoryInput,
  type UpdateDistributionTerritoryNoteInput,
} from "@shared/contracts";
import { apiClient } from "@/lib/api-client";
import { ownerDocumentApi } from "@/components/documents/owner-document-api";

const territoryResponse = apiSuccessSchema(distributionTerritorySchema);
const base = (projectId: string) =>
  `/projects/${projectId}/distribution/territories`;
export const territoryPath = (projectId: string, territoryId: string) =>
  `${base(projectId)}/${territoryId}`;

export const listTerritories = (projectId: string) =>
  apiClient(
    "GET",
    base(projectId),
    apiSuccessSchema(distributionTerritoryListSchema),
  );
export const getTerritory = (projectId: string, territoryId: string) =>
  apiClient("GET", territoryPath(projectId, territoryId), territoryResponse);
export const createTerritory = (
  projectId: string,
  input: CreateDistributionTerritoryInput,
) => apiClient("POST", base(projectId), territoryResponse, input);
export const updateTerritory = (
  projectId: string,
  territoryId: string,
  input: UpdateDistributionTerritoryInput,
) =>
  apiClient(
    "PATCH",
    territoryPath(projectId, territoryId),
    territoryResponse,
    input,
  );
export const changeTerritoryStatus = (
  projectId: string,
  territoryId: string,
  input: ChangeDistributionTerritoryStatusInput,
) =>
  apiClient(
    "POST",
    `${territoryPath(projectId, territoryId)}/status`,
    territoryResponse,
    input,
  );
export const deleteTerritory = (
  projectId: string,
  territoryId: string,
  version: number,
) =>
  apiClient("DELETE", territoryPath(projectId, territoryId), z.undefined(), {
    version,
  });
export const createTerritoryNote = (
  projectId: string,
  territoryId: string,
  input: CreateDistributionTerritoryNoteInput,
) =>
  apiClient(
    "POST",
    `${territoryPath(projectId, territoryId)}/notes`,
    territoryResponse,
    input,
  );
export const updateTerritoryNote = (
  projectId: string,
  territoryId: string,
  noteId: string,
  input: UpdateDistributionTerritoryNoteInput,
) =>
  apiClient(
    "PATCH",
    `${territoryPath(projectId, territoryId)}/notes/${noteId}`,
    territoryResponse,
    input,
  );
export const deleteTerritoryNote = (
  projectId: string,
  territoryId: string,
  noteId: string,
  version: number,
) =>
  apiClient(
    "DELETE",
    `${territoryPath(projectId, territoryId)}/notes/${noteId}`,
    territoryResponse,
    { version },
  );
export const territoryDocuments = ownerDocumentApi(distributionTerritorySchema);
