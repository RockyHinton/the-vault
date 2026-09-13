import {
  currencyCodeSchema,
  type BudgetVersionStatus,
  type CurrencyCode,
} from "@shared/contracts";

export const currencyCodes = currencyCodeSchema.options;
export const currencyLabels: Record<CurrencyCode, string> = {
  GBP: "GBP · British pound",
  USD: "USD · US dollar",
  EUR: "EUR · Euro",
};

export const budgetStatusLabels: Record<BudgetVersionStatus, string> = {
  draft: "Draft",
  awaiting_approval: "Awaiting approval",
  locked: "Locked",
};

export const budgetStatusClass: Record<BudgetVersionStatus, string> = {
  draft: "bg-blue-100 text-blue-800 border-blue-200",
  awaiting_approval: "bg-amber-100 text-amber-800 border-amber-200",
  locked: "bg-green-100 text-green-800 border-green-200",
};
