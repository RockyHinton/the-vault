import { useQuery } from "@tanstack/react-query";
import type {
  AddScriptVersionInput,
  CreateScriptAnnotationInput,
  CreateScriptInput,
  UpdateScriptAnnotationInput,
} from "@shared/contracts";
import { useVaultMutation } from "@/lib/mutations";
import { documentsKey } from "@/features/documents/use-documents";
import {
  addScriptVersion,
  createAnnotation,
  createScript,
  deleteAnnotation,
  deleteScript,
  getScript,
  listAnnotations,
  listScripts,
  updateAnnotation,
} from "./scripts-api";

export const scriptsKey = (projectId: string) =>
  ["scripts", projectId] as const;
export const scriptKey = (projectId: string, scriptId: string) =>
  ["scripts", projectId, "item", scriptId] as const;
/** Annotations are cached per exact document version, never per script. */
export const annotationsKey = (
  projectId: string,
  scriptId: string,
  documentId: string,
) =>
  ["scripts", projectId, "item", scriptId, "annotations", documentId] as const;
const auditKey = ["audit-events"] as const;

const afterScriptChange = ({ projectId }: { projectId: string }) => [
  scriptsKey(projectId),
  documentsKey(projectId),
  auditKey,
];

interface ScriptRef {
  projectId: string;
  scriptId: string;
}

export function useScripts(projectId: string) {
  return useQuery({
    queryKey: scriptsKey(projectId),
    queryFn: () => listScripts(projectId),
  });
}

export function useScript(
  projectId: string | undefined,
  scriptId: string | undefined,
) {
  return useQuery({
    queryKey: scriptKey(projectId ?? "", scriptId ?? ""),
    queryFn: () => getScript(projectId!, scriptId!),
    enabled: Boolean(projectId && scriptId),
  });
}

export function useAnnotations(
  projectId: string,
  scriptId: string,
  documentId: string,
) {
  return useQuery({
    queryKey: annotationsKey(projectId, scriptId, documentId),
    queryFn: () => listAnnotations(projectId, scriptId, documentId),
  });
}

export function useCreateScript() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: CreateScriptInput;
    }) => createScript(projectId, input),
    invalidate: afterScriptChange,
    successMessage: "Script uploaded.",
  });
}

export function useAddScriptVersion() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      scriptId,
      input,
    }: ScriptRef & { input: AddScriptVersionInput }) =>
      addScriptVersion(projectId, scriptId, input),
    invalidate: (variables) => [
      ...afterScriptChange(variables),
      scriptKey(variables.projectId, variables.scriptId),
    ],
    successMessage: (result) =>
      `Version ${result.data.script.currentVersion.versionNumber} uploaded.`,
  });
}

export function useDeleteScript() {
  return useVaultMutation({
    mutationFn: ({ projectId, scriptId }: ScriptRef) =>
      deleteScript(projectId, scriptId),
    invalidate: afterScriptChange,
    successMessage: "Script removed.",
  });
}

const afterAnnotationChange = ({
  projectId,
  scriptId,
  documentId,
}: ScriptRef & { documentId: string }) => [
  annotationsKey(projectId, scriptId, documentId),
  auditKey,
];

export function useCreateAnnotation() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      scriptId,
      documentId,
      input,
    }: ScriptRef & {
      documentId: string;
      input: CreateScriptAnnotationInput;
    }) => createAnnotation(projectId, scriptId, documentId, input),
    invalidate: afterAnnotationChange,
    successMessage: "Note saved.",
  });
}

export function useUpdateAnnotation() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      scriptId,
      annotationId,
      input,
    }: ScriptRef & {
      documentId: string;
      annotationId: string;
      input: UpdateScriptAnnotationInput;
    }) => updateAnnotation(projectId, scriptId, annotationId, input),
    invalidate: afterAnnotationChange,
    successMessage: "Note updated.",
  });
}

export function useDeleteAnnotation() {
  return useVaultMutation({
    mutationFn: ({
      projectId,
      scriptId,
      annotationId,
      version,
    }: ScriptRef & {
      documentId: string;
      annotationId: string;
      version: number;
    }) => deleteAnnotation(projectId, scriptId, annotationId, version),
    invalidate: afterAnnotationChange,
    successMessage: "Note deleted.",
  });
}
