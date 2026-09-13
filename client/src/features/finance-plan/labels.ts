import {
  financeSourceStatusSchema,
  financeSourceTypeSchema,
  type FinanceSourceStatus,
  type FinanceSourceType,
} from "@shared/contracts";

export const financeSourceTypes = financeSourceTypeSchema.options;
export const financeSourceTypeLabels: Record<FinanceSourceType, string> = {
  equity: "Equity",
  pre_sale: "Pre-sale",
  distributor_mg: "Distributor MG",
  grant: "Grant",
  tax_credit: "Tax Credit",
  loan: "Loan / Lender",
  gap_finance: "Gap Finance",
  other: "Other",
};

export const financeSourceStatuses = financeSourceStatusSchema.options;
export const financeSourceStatusLabels: Record<FinanceSourceStatus, string> = {
  targeted: "Targeted",
  soft_committed: "Soft committed",
  approved: "Approved",
};
/** The statuses a user may set directly; approval is its own command. */
export const editableSourceStatuses = ["targeted", "soft_committed"] as const;

export const financeSourceStatusClass: Record<FinanceSourceStatus, string> = {
  targeted: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  soft_committed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  approved:
    "bg-green-600 text-white hover:bg-green-700 border-transparent shadow-sm",
};
