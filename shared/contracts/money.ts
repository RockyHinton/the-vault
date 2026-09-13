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

/** The same shape as `moneySchema` but for values the server already normalised. */
export const moneyValueSchema = z.string().regex(/^\d{1,13}\.\d{2}$/);

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

/** Groups thousands without touching floating point: "1234567.80" → "$1,234,567.80". */
export function formatMoney(value: string, currency: CurrencyCode): string {
  const normalized = normalizeMoney(
    value.startsWith("-") ? value.slice(1) : value,
  );
  const [whole, fraction] = normalized.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${value.startsWith("-") ? "-" : ""}${currencySymbols[currency]}${grouped}.${fraction}`;
}
