import {
  annotationTagSchema,
  annotationTypeSchema,
  type AnnotationTag,
  type AnnotationType,
} from "@shared/contracts";

export const annotationTypes = annotationTypeSchema.options;
export const annotationTags = annotationTagSchema.options;

export const annotationTypeLabels: Record<AnnotationType, string> = {
  creative: "Creative",
  commercial: "Commercial",
  question: "Question",
  concern: "Concern",
};

export const annotationTagLabels: Record<AnnotationTag, string> = {
  dialogue: "Dialogue",
  structure: "Structure",
  character: "Character",
  pacing: "Pacing",
  budget_impact: "Budget Impact",
  other: "Other",
};

/** Route of the full-screen reader for one exact script version. */
export const scriptReaderPath = (
  projectId: string,
  scriptId: string,
  documentId: string,
) => `/script-reader/${projectId}/${scriptId}/${documentId}`;
