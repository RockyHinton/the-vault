import { noteCategorySchema, type NoteCategory } from "@shared/contracts";

export const noteCategories = noteCategorySchema.options;
export const noteCategoryLabels: Record<NoteCategory, string> = {
  script: "Script",
  financing: "Financing",
  cast: "Cast",
  other: "Other",
};
