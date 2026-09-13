import {
  legalCategorySchema,
  type DocumentStatus,
  type LegalCategory,
  type LegalDetails,
  type LegalRecord,
} from "@shared/contracts";

export const legalCategories = legalCategorySchema.options;

/** Field descriptors drive the add dialog and the read-only detail grid for one category. */
export type LegalFieldDescriptor =
  | {
      key: string;
      label: string;
      kind: "text";
      required?: boolean;
      placeholder?: string;
    }
  | { key: string; label: string; kind: "email" }
  | { key: string; label: string; kind: "date" }
  | { key: string; label: string; kind: "amount"; required?: boolean }
  | {
      key: string;
      label: string;
      kind: "select";
      required?: boolean;
      options: readonly string[];
      defaultValue?: string;
    };

export interface LegalCategoryConfig {
  label: string;
  route: string;
  addButtonLabel: string;
  modalTitle: string;
  nameLabel: string;
  namePlaceholder?: string;
  fields: LegalFieldDescriptor[];
  secondaryLine: (record: LegalRecord) => string;
}

const email: LegalFieldDescriptor = {
  key: "email",
  label: "Contact email",
  kind: "email",
};
const contactName: LegalFieldDescriptor = {
  key: "contactName",
  label: "Contact name",
  kind: "text",
};
const company: LegalFieldDescriptor = {
  key: "company",
  label: "Company",
  kind: "text",
};

const detail = (record: LegalRecord, key: string): string => {
  const value = (record.details as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
};

export const legalCategoryConfig: Record<LegalCategory, LegalCategoryConfig> = {
  chain_of_title: {
    label: "Chain of Title",
    route: "chain-of-title",
    addButtonLabel: "Add Rights Item",
    modalTitle: "Add Rights Item",
    nameLabel: "Rights item title",
    namePlaceholder: "e.g. Original Screenplay",
    fields: [
      {
        key: "holder",
        label: "Rights holder / Author",
        kind: "text",
        required: true,
      },
      {
        key: "rightsType",
        label: "Rights type",
        kind: "select",
        required: true,
        options: [
          "Original Screenplay",
          "Underlying Work (Book/Article)",
          "Rewrite",
          "Assignment",
          "Option",
          "Other",
        ],
      },
      { key: "agreementDate", label: "Option / Agreement date", kind: "date" },
    ],
    secondaryLine: (r) => `${detail(r, "holder")} · ${detail(r, "rightsType")}`,
  },
  writer_agreements: {
    label: "Writer Agreements",
    route: "writer-agreements",
    addButtonLabel: "Add Writer",
    modalTitle: "Add Writer",
    nameLabel: "Writer name",
    fields: [
      {
        key: "role",
        label: "Role",
        kind: "select",
        required: true,
        options: [
          "Original Writer",
          "Co-writer",
          "Rewrite",
          "Polish",
          "Story By",
          "Other",
        ],
      },
      company,
      { key: "email", label: "Email", kind: "email" },
    ],
    secondaryLine: (r) =>
      `${detail(r, "role")}${detail(r, "company") ? ` · ${detail(r, "company")}` : ""}`,
  },
  investment_agreements: {
    label: "Investment Agreements",
    route: "investment-agreements",
    addButtonLabel: "Add Investor",
    modalTitle: "Add Investor",
    nameLabel: "Investor name / entity",
    fields: [
      {
        key: "investorType",
        label: "Investor type",
        kind: "select",
        required: true,
        options: ["Individual", "Company", "Fund", "Other"],
      },
      {
        key: "currency",
        label: "Currency",
        kind: "select",
        required: true,
        options: ["GBP", "USD", "EUR"],
        defaultValue: "GBP",
      },
      {
        key: "amount",
        label: "Amount committed",
        kind: "amount",
        required: true,
      },
      {
        key: "commitment",
        label: "Status",
        kind: "select",
        required: true,
        options: ["Targeted", "Soft committed", "Closed"],
      },
      email,
    ],
    secondaryLine: (r) =>
      `${detail(r, "currency")} ${Number(detail(r, "amount")).toLocaleString()} · ${detail(r, "commitment")}`,
  },
  co_production: {
    label: "Co-Production",
    route: "co-production",
    addButtonLabel: "Add Co-Producer",
    modalTitle: "Add Co-Producer",
    nameLabel: "Partner company name",
    fields: [
      { key: "country", label: "Country", kind: "text" },
      contactName,
      email,
    ],
    secondaryLine: (r) => detail(r, "country"),
  },
  producers_agreements: {
    label: "Producers Agreements",
    route: "producers-agreements",
    addButtonLabel: "Add Producer",
    modalTitle: "Add Producer",
    nameLabel: "Producer name",
    fields: [
      {
        key: "role",
        label: "Producer role",
        kind: "select",
        required: true,
        options: [
          "Producer",
          "Executive Producer",
          "Line Producer",
          "Co-Producer",
          "Associate Producer",
          "Other",
        ],
      },
      company,
      { key: "email", label: "Email", kind: "email" },
    ],
    secondaryLine: (r) =>
      `${detail(r, "role")}${detail(r, "company") ? ` · ${detail(r, "company")}` : ""}`,
  },
  director_agreements: {
    label: "Director Agreements",
    route: "director-agreements",
    addButtonLabel: "Add Director",
    modalTitle: "Add Director",
    nameLabel: "Director name",
    fields: [company, { key: "email", label: "Email", kind: "email" }],
    secondaryLine: () => "Director",
  },
  cast_agreements: {
    label: "Cast Agreements",
    route: "cast-agreements",
    addButtonLabel: "Add Cast Member",
    modalTitle: "Add Cast Member",
    nameLabel: "Cast name",
    fields: [
      {
        key: "role",
        label: "Role / Character name",
        kind: "text",
        required: true,
      },
      {
        key: "castType",
        label: "Cast type",
        kind: "select",
        required: true,
        options: ["Lead", "Supporting", "Day Player", "Extra", "Other"],
      },
      { key: "fee", label: "Fee", kind: "amount" },
      { key: "agent", label: "Agent / Representative", kind: "text" },
    ],
    secondaryLine: (r) => `${detail(r, "role")} · ${detail(r, "castType")}`,
  },
  banking_docs: {
    label: "Banking Docs",
    route: "banking-docs",
    addButtonLabel: "Add Bank",
    modalTitle: "Add Bank / Financial Entity",
    nameLabel: "Bank / entity name",
    fields: [
      {
        key: "purpose",
        label: "Purpose",
        kind: "select",
        required: true,
        options: [
          "Production Account",
          "Escrow",
          "Completion Bond",
          "Loan Facility",
          "Other",
        ],
      },
      contactName,
      email,
    ],
    secondaryLine: (r) => detail(r, "purpose"),
  },
  funding_tax_credit: {
    label: "Funding / Tax Credit",
    route: "funding-tax-credit",
    addButtonLabel: "Add Funding Body",
    modalTitle: "Add Funding Body / Authority",
    nameLabel: "Funding body / authority name",
    fields: [
      {
        key: "fundingType",
        label: "Funding type",
        kind: "select",
        required: true,
        options: [
          "Tax Credit",
          "Grant",
          "Public Fund",
          "Rebate / Incentive",
          "Other",
        ],
      },
      { key: "expectedAmount", label: "Expected amount", kind: "amount" },
      { key: "region", label: "Country/Region", kind: "text" },
    ],
    secondaryLine: (r) =>
      `${detail(r, "fundingType")}${detail(r, "region") ? ` · ${detail(r, "region")}` : ""}`,
  },
  sales_agency: {
    label: "Sales Agency",
    route: "sales-agency",
    addButtonLabel: "Add Sales Agent",
    modalTitle: "Add Sales Agent",
    nameLabel: "Sales agent name",
    fields: [
      { key: "territory", label: "Territory focus", kind: "text" },
      contactName,
      email,
    ],
    secondaryLine: (r) => detail(r, "territory"),
  },
  cama: {
    label: "CAMA",
    route: "cama",
    addButtonLabel: "Add Collection Account Manager",
    modalTitle: "Add Collection Account Manager",
    nameLabel: "CAMA provider name",
    fields: [contactName, email],
    secondaryLine: () => "CAMA",
  },
};

export function legalCategoryForRoute(
  route: string,
): LegalCategory | undefined {
  return legalCategories.find(
    (category) => legalCategoryConfig[category].route === route,
  );
}

/**
 * Builds the typed details object from the dialog's field values. Empty
 * optional fields become null; the contract validates the result.
 */
export function detailsFromForm(
  category: LegalCategory,
  values: Record<string, string>,
): LegalDetails {
  const details: Record<string, unknown> = { category };
  for (const field of legalCategoryConfig[category].fields) {
    const raw = values[field.key]?.trim() ?? "";
    details[field.key] = raw === "" ? null : raw;
  }
  return details as LegalDetails;
}

export const legalDocumentStatusLabels: Record<DocumentStatus, string> = {
  draft: "Draft",
  under_review: "Pending",
  signed: "Signed",
  final: "Approved",
};
export const legalDocumentStatuses = Object.keys(
  legalDocumentStatusLabels,
) as DocumentStatus[];
