import { useQuery } from "@tanstack/react-query";
import type { CreateNoteInput, UpdateNoteInput } from "@shared/contracts";
import { useVaultMutation } from "@/lib/mutations";
import { createNote, deleteNote, listNotes, updateNote } from "./notes-api";

export const notesKey = (projectId: string) => ["notes", projectId] as const;
const auditKey = ["audit-events"] as const;
const afterChange = ({ projectId }: { projectId: string }) => [
  notesKey(projectId),
  auditKey,
];

export function useNotes(projectId: string) {
  return useQuery({
    queryKey: notesKey(projectId),
    queryFn: () => listNotes(projectId),
  });
}

export function useCreateNote() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: CreateNoteInput;
    }) => createNote(projectId, input),
    invalidate: afterChange,
    successMessage: "Note posted.",
  });
}

export function useUpdateNote() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      noteId,
      input,
    }: {
      projectId: string;
      noteId: string;
      input: UpdateNoteInput;
    }) => updateNote(projectId, noteId, input),
    invalidate: afterChange,
    successMessage: "Note updated.",
  });
}

export function useDeleteNote() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      noteId,
      version,
    }: {
      projectId: string;
      noteId: string;
      version: number;
    }) => deleteNote(projectId, noteId, version),
    invalidate: afterChange,
    successMessage: "Note deleted.",
  });
}
