import { z } from "zod";

/**
 * Date-only values cross every boundary as `YYYY-MM-DD` and are stored in
 * PostgreSQL `date` columns. Validation checks the calendar, not just the
 * shape, so an impossible date such as 2026-02-30 is a 400 at the edge rather
 * than a database error. No time zone is ever involved: the string is read as
 * a calendar date and written back as one.
 */
const ISO_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** True when the string is a real calendar date in the proleptic Gregorian calendar. */
export function isCalendarDate(value: string): boolean {
  if (!ISO_DATE_SHAPE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

export const isoDateSchema = z
  .string()
  .trim()
  .regex(ISO_DATE_SHAPE, "Use YYYY-MM-DD.")
  .refine(isCalendarDate, { message: "Enter a real calendar date." });
