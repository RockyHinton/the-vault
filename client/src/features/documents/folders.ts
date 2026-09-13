import { documentFolderSchema, type DocumentFolder } from "@shared/contracts";

/** Human labels for folders, derived from the workspace section names. */
const labels: Record<DocumentFolder, string> = {
  general: "General",
  script: "Script",
  "script/reader-analysis": "Script · Reader Analysis",
  "script/cast-wishlist": "Script · Cast Wishlist",
  producers: "Producers",
  creatives: "Creatives",
  "underlying-rights": "Underlying Rights",
  "financing/budget": "Financing · Budget",
  "financing/finance-plan": "Financing · Finance Plan",
  "financing/cashflow": "Financing · Cashflow",
  "legal/chain-of-title": "Documentation · Chain of Title",
  "legal/writer-agreements": "Documentation · Writer Agreements",
  "legal/investment-agreements": "Documentation · Investment Agreements",
  "legal/co-production": "Documentation · Co-Production",
  "legal/producers-agreements": "Documentation · Producers Agreements",
  "legal/director-agreements": "Documentation · Director Agreements",
  "legal/cast-agreements": "Documentation · Cast Agreements",
  "legal/banking-docs": "Documentation · Banking Docs",
  "legal/funding-tax-credit": "Documentation · Funding / Tax Credit",
  "legal/sales-agency": "Documentation · Sales Agency",
  "legal/cama": "Documentation · CAMA",
  distribution: "Distribution",
  "schedules/shooting-schedule": "Schedules · Shooting Schedule",
  "schedules/call-sheets": "Schedules · Daily Call Sheets",
};

export const documentFolders = documentFolderSchema.options;

export function folderLabel(folder: DocumentFolder): string {
  return labels[folder];
}

/** Maps a workspace category/subcategory pair to a folder, if one exists. */
export function folderForWorkspacePath(
  category: string | undefined,
  subcategory: string | undefined,
): DocumentFolder | undefined {
  const candidate = subcategory ? `${category}/${subcategory}` : category;
  const parsed = documentFolderSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}
