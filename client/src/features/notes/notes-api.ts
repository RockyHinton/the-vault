import {
  apiSuccessSchema,
  noteSchema,
  type CreateNoteInput,
  type UpdateNoteInput,
} from "@shared/contracts";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";

const noteResponse = apiSuccessSchema(noteSchema);
const noteListResponse = apiSuccessSchema(
  z.object({ items: z.array(noteSchema) }),
);
const base = (projectId: string) => `/projects/${projectId}/notes`;

export const listNotes = (projectId: string) =>
  apiClient("GET", base(projectId), noteListResponse);
export const createNote = (projectId: string, input: CreateNoteInput) =>
  apiClient("POST", base(projectId), noteResponse, input);
export const updateNote = (
  projectId: string,
  noteId: string,
  input: UpdateNoteInput,
) => apiClient("PATCH", `${base(projectId)}/${noteId}`, noteResponse, input);
export const deleteNote = (
  projectId: string,
  noteId: string,
  version: number,
) =>
  apiClient("DELETE", `${base(projectId)}/${noteId}`, z.undefined(), {
    version,
  });
