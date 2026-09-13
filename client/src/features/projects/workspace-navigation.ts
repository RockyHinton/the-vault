import type { Project } from "@shared/contracts";

/**
 * Static workspace navigation. This is product configuration, not data: the
 * sections a project workspace offers and which stages show them.
 */
export interface WorkspaceSubcategory {
  slug: string;
  name: string;
}

export interface WorkspaceCategory {
  slug: string;
  name: string;
  icon:
    | "FileText"
    | "Users"
    | "User"
    | "CircleDollarSign"
    | "Scale"
    | "Globe"
    | "Calendar";
  subcategories: WorkspaceSubcategory[];
}

const categories: WorkspaceCategory[] = [
  { slug: "script", name: "Script", icon: "FileText", subcategories: [] },
  { slug: "producers", name: "Producers", icon: "Users", subcategories: [] },
  { slug: "creatives", name: "Creatives", icon: "User", subcategories: [] },
  {
    slug: "underlying-rights",
    name: "Underlying Rights",
    icon: "FileText",
    subcategories: [],
  },
  {
    slug: "financing",
    name: "Financing",
    icon: "CircleDollarSign",
    subcategories: [
      { slug: "budget", name: "Budget" },
      { slug: "finance-plan", name: "Finance Plan" },
      { slug: "cashflow", name: "Cashflow" },
    ],
  },
  {
    slug: "legal",
    name: "Documentation",
    icon: "Scale",
    subcategories: [
      { slug: "chain-of-title", name: "Chain of Title" },
      { slug: "writer-agreements", name: "Writer Agreements" },
      { slug: "investment-agreements", name: "Investment Agreements" },
      { slug: "co-production", name: "Co-Production" },
      { slug: "producers-agreements", name: "Producers Agreements" },
      { slug: "director-agreements", name: "Director Agreements" },
      { slug: "cast-agreements", name: "Cast Agreements" },
      { slug: "banking-docs", name: "Banking Docs" },
      { slug: "funding-tax-credit", name: "Funding / Tax Credit" },
      { slug: "sales-agency", name: "Sales Agency" },
      { slug: "cama", name: "CAMA" },
    ],
  },
  {
    slug: "distribution",
    name: "Distribution",
    icon: "Globe",
    subcategories: [],
  },
  {
    slug: "schedules",
    name: "Schedules",
    icon: "Calendar",
    subcategories: [
      { slug: "shooting-schedule", name: "Shooting Schedule" },
      { slug: "call-sheets", name: "Daily Call Sheets" },
    ],
  },
];

/** Which sections a project shows, by its server stage and archive state. */
export function workspaceCategoriesFor(project: Project): WorkspaceCategory[] {
  const archived = Boolean(project.archivedAt);
  const stage = project.stage;
  const visible = new Set<string>([
    "script",
    "financing",
    "producers",
    "creatives",
    "underlying-rights",
  ]);
  if (stage === "development" || stage === "production" || archived)
    visible.add("legal");
  if (stage === "production" || archived) {
    visible.add("distribution");
    visible.add("schedules");
  }
  return categories.filter((category) => visible.has(category.slug));
}

export function findWorkspaceCategory(
  slug: string | undefined,
): WorkspaceCategory | undefined {
  return slug
    ? categories.find((category) => category.slug === slug)
    : undefined;
}
