import { z } from "zod";

/**
 * Money crosses every boundary as a decimal string with exactly two places
 * ("125000.00"). PostgreSQL stores numeric(14,2); nothing here or in the
 * client converts through JavaScript floating point.
 */
export const currencyCodeSchema = z.enum(["GBP", "USD", "EUR"]);
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;

const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

/** Normalises "1200", "1200.5" and "1200.50" to "1200.50". */
export function normalizeMoney(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${(fraction + "00").slice(0, 2)}`;
}

/** A non-negative amount with up to twelve integer digits and two decimals, normalised on parse. */
export const moneySchema = z
  .string()
  .trim()
  .regex(MONEY_PATTERN, "Enter an amount such as 25000 or 25000.50.")
  .transform(normalizeMoney);

/**
 * A single stored amount as the server returns it: exactly what numeric(14,2)
 * can hold, at most twelve integer digits (999,999,999,999.99). Line items,
 * sources, payments and opening balances.
 */
export const storedMoneyValueSchema = z.string().regex(/^\d{1,12}\.\d{2}$/);

/**
 * A total derived by adding stored amounts (PostgreSQL SUM or BigInt cents):
 * department and version totals, financing summaries. A sum is not bounded by
 * the column's precision, so its bound is explicit and deliberately wide:
 * eighteen integer digits holds one million maximum stored amounts
 * (999,999,999,999.99 × 10⁶ < 10¹⁸). The shape stays exact: digits, a point,
 * two decimals, nothing else.
 */
export const moneyTotalValueSchema = z.string().regex(/^\d{1,18}\.\d{2}$/);

/** A derived total that may be negative (cash-flow net movements and balances); same bound. */
export const signedMoneyTotalValueSchema = z
  .string()
  .regex(/^-?\d{1,18}\.\d{2}$/);

export function moneyToCents(value: string): bigint {
  const [whole, fraction = "00"] = normalizeMoney(value).split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction);
}

export function centsToMoney(cents: bigint): string {
  const negative = cents < BigInt(0);
  const absolute = negative ? -cents : cents;
  const whole = absolute / BigInt(100);
  const fraction = absolute % BigInt(100);
  return `${negative ? "-" : ""}${whole}.${fraction.toString().padStart(2, "0")}`;
}

/** Exact sum of decimal strings; the client uses it only for display of values the server returned. */
export function sumMoney(values: readonly string[]): string {
  return centsToMoney(
    values.reduce((total, value) => total + moneyToCents(value), BigInt(0)),
  );
}

const currencySymbols: Record<CurrencyCode, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
};

/** Groups thousands without touching floating point: "-1234567.8" → "-1,234,567.80". */
export function groupMoney(value: string): string {
  const negative = value.startsWith("-");
  const [whole, fraction] = normalizeMoney(
    negative ? value.slice(1) : value,
  ).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}

/** The grouped amount with its currency symbol: "1234567.80" → "$1,234,567.80". */
export function formatMoney(value: string, currency: CurrencyCode): string {
  const grouped = groupMoney(value);
  const negative = grouped.startsWith("-");
  return `${negative ? "-" : ""}${currencySymbols[currency]}${negative ? grouped.slice(1) : grouped}`;
}
