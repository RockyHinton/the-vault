import { z } from "zod";
import { centsToMoney, moneyToCents } from "./money";

/**
 * The one cash-flow projection. The server runs it for every response and
 * the client renders the returned strings. All money is BigInt cents and all
 * dates are `YYYY-MM-DD` strings handled as UTC day numbers, so the result is
 * identical on any host in any time zone.
 */

export const cashFlowTimeframeValues = ["monthly", "weekly"] as const;
export type CashFlowTimeframe = (typeof cashFlowTimeframeValues)[number];
export const cashFlowDirectionValues = ["inflow", "outflow"] as const;
export type CashFlowDirection = (typeof cashFlowDirectionValues)[number];

/** A signed exact amount such as "-1200.50"; balances may be negative. */
export const signedMoneyValueSchema = z.string().regex(/^-?\d{1,14}\.\d{2}$/);

export interface CashFlowProjectionInput {
  timeframe: CashFlowTimeframe;
  /** The reference day; the range always includes it. */
  today: string;
  openingBalance: string;
  departments: readonly {
    id: string;
    /** Exact total of the department in the referenced locked budget version. */
    total: string;
    /** Inclusive spend window; the total spreads evenly by day across it. */
    window: { startDate: string; endDate: string } | null;
  }[];
  payments: readonly {
    departmentId: string;
    amount: string;
    direction: CashFlowDirection;
    date: string;
  }[];
  /** Approved financing sources with the date the money is expected. */
  inflows: readonly {
    id: string;
    amount: string;
    scheduledDate: string | null;
  }[];
}

export const cashFlowPeriodSchema = z.object({
  /** `YYYY-MM` for months, the Monday `YYYY-MM-DD` for weeks. */
  id: z.string(),
  label: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  inflow: signedMoneyValueSchema,
  outflow: signedMoneyValueSchema,
  net: signedMoneyValueSchema,
  closingBalance: signedMoneyValueSchema,
});
export type CashFlowPeriod = z.infer<typeof cashFlowPeriodSchema>;

export const cashFlowProjectionSchema = z.object({
  timeframe: z.enum(cashFlowTimeframeValues),
  periods: z.array(cashFlowPeriodSchema),
  totalInflow: signedMoneyValueSchema,
  totalOutflow: signedMoneyValueSchema,
  closingBalance: signedMoneyValueSchema,
  lowestBalance: signedMoneyValueSchema,
  lowestBalancePeriodId: z.string().nullable(),
  /** The first period whose closing balance is negative. */
  firstShortfallPeriodId: z.string().nullable(),
  /** Scheduled outflow per department: window spread plus outflow payments. */
  departmentOutflows: z.array(
    z.object({ departmentId: z.string(), amount: signedMoneyValueSchema }),
  ),
  /** Approved money with no expected date: never enters a period. */
  unscheduledInflow: signedMoneyValueSchema,
  /** Budget departments with no window: never enters a period. */
  unscheduledOutflow: signedMoneyValueSchema,
});
export type CashFlowProjection = z.infer<typeof cashFlowProjectionSchema>;

const DAY_MS = 86_400_000;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Days since 1970-01-01 (UTC) for a `YYYY-MM-DD` string. */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function dateFromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function parts(day: number): { year: number; month: number; date: number } {
  const value = new Date(day * DAY_MS);
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    date: value.getUTCDate(),
  };
}

function monthStart(year: number, month: number): number {
  return Math.round(Date.UTC(year, month - 1, 1) / DAY_MS);
}

/** Last day of a month: the day before the next month's first day. */
function monthEnd(year: number, month: number): number {
  return Math.round(Date.UTC(year, month, 1) / DAY_MS) - 1;
}

function addMonths(day: number, months: number): number {
  const { year, month, date } = parts(day);
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  const clamped = Math.min(
    date,
    monthEnd(targetYear, targetMonth) - monthStart(targetYear, targetMonth) + 1,
  );
  return Math.round(Date.UTC(targetYear, targetMonth - 1, clamped) / DAY_MS);
}

/** Monday of the week containing the day (1970-01-01 was a Thursday). */
function weekStart(day: number): number {
  return day - ((((day + 3) % 7) + 7) % 7);
}

interface Period {
  id: string;
  label: string;
  start: number;
  end: number;
}

function monthlyPeriods(first: number, last: number): Period[] {
  const periods: Period[] = [];
  let { year, month } = parts(first);
  const end = parts(last);
  while (year < end.year || (year === end.year && month <= end.month)) {
    periods.push({
      id: `${year}-${String(month).padStart(2, "0")}`,
      label: `${MONTHS[month - 1]} ${year}`,
      start: monthStart(year, month),
      end: monthEnd(year, month),
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return periods;
}

function weeklyPeriods(first: number, last: number): Period[] {
  const periods: Period[] = [];
  for (let start = weekStart(first); start <= last; start += 7) {
    const { month, date, year } = parts(start);
    periods.push({
      id: dateFromDayNumber(start),
      label: `w/c ${date} ${MONTHS[month - 1]} ${year}`,
      start,
      end: start + 6,
    });
  }
  return periods;
}

const ZERO = BigInt(0);
const min = (a: bigint, b: bigint) => (a < b ? a : b);

/**
 * How much of `total` has been spent by the end of `throughDay` when it is
 * spread evenly over the inclusive window: floor(total × elapsedDays ÷
 * windowDays). Differences between consecutive days sum exactly to the total.
 */
function spentThrough(
  total: bigint,
  windowStart: number,
  windowEnd: number,
  throughDay: number,
): bigint {
  const windowDays = BigInt(windowEnd - windowStart + 1);
  const elapsed = Math.min(
    Math.max(throughDay - windowStart + 1, 0),
    windowEnd - windowStart + 1,
  );
  return (total * BigInt(elapsed)) / windowDays;
}

export function projectCashFlow(
  input: CashFlowProjectionInput,
): CashFlowProjection {
  const today = dayNumber(input.today);
  const days: number[] = [today];
  for (const department of input.departments)
    if (department.window)
      days.push(
        dayNumber(department.window.startDate),
        dayNumber(department.window.endDate),
      );
  for (const payment of input.payments) days.push(dayNumber(payment.date));
  for (const inflow of input.inflows)
    if (inflow.scheduledDate) days.push(dayNumber(inflow.scheduledDate));
  const first = Math.min(...days);
  const last = addMonths(Math.max(...days), 3);
  const periods =
    input.timeframe === "monthly"
      ? monthlyPeriods(first, last)
      : weeklyPeriods(first, last);

  const departmentOutflows = new Map<string, bigint>();
  const add = (departmentId: string, cents: bigint) =>
    departmentOutflows.set(
      departmentId,
      (departmentOutflows.get(departmentId) ?? ZERO) + cents,
    );
  let unscheduledOutflow = ZERO;
  for (const department of input.departments) {
    if (!department.window)
      unscheduledOutflow += moneyToCents(department.total);
    else add(department.id, ZERO);
  }
  let unscheduledInflow = ZERO;
  for (const inflow of input.inflows)
    if (!inflow.scheduledDate) unscheduledInflow += moneyToCents(inflow.amount);

  let balance = moneyToCents(input.openingBalance);
  let totalInflow = ZERO;
  let totalOutflow = ZERO;
  let lowest = balance;
  let lowestPeriodId: string | null = null;
  let firstShortfallPeriodId: string | null = null;

  const rows = periods.map((period) => {
    let inflow = ZERO;
    let outflow = ZERO;
    for (const source of input.inflows) {
      if (!source.scheduledDate) continue;
      const day = dayNumber(source.scheduledDate);
      if (day >= period.start && day <= period.end)
        inflow += moneyToCents(source.amount);
    }
    for (const payment of input.payments) {
      const day = dayNumber(payment.date);
      if (day < period.start || day > period.end) continue;
      const cents = moneyToCents(payment.amount);
      if (payment.direction === "inflow") inflow += cents;
      else {
        outflow += cents;
        add(payment.departmentId, cents);
      }
    }
    for (const department of input.departments) {
      if (!department.window) continue;
      const start = dayNumber(department.window.startDate);
      const end = dayNumber(department.window.endDate);
      const total = moneyToCents(department.total);
      const cents =
        spentThrough(total, start, end, period.end) -
        spentThrough(total, start, end, period.start - 1);
      if (cents > ZERO) {
        outflow += cents;
        add(department.id, cents);
      }
    }
    const net = inflow - outflow;
    balance += net;
    totalInflow += inflow;
    totalOutflow += outflow;
    if (balance < lowest || lowestPeriodId === null) {
      lowest = min(lowest, balance);
      if (balance <= lowest) lowestPeriodId = period.id;
    }
    if (balance < ZERO && firstShortfallPeriodId === null)
      firstShortfallPeriodId = period.id;
    return {
      id: period.id,
      label: period.label,
      startDate: dateFromDayNumber(period.start),
      endDate: dateFromDayNumber(period.end),
      inflow: centsToMoney(inflow),
      outflow: centsToMoney(outflow),
      net: centsToMoney(net),
      closingBalance: centsToMoney(balance),
    };
  });

  return {
    timeframe: input.timeframe,
    periods: rows,
    totalInflow: centsToMoney(totalInflow),
    totalOutflow: centsToMoney(totalOutflow),
    closingBalance: centsToMoney(balance),
    lowestBalance: centsToMoney(lowest),
    lowestBalancePeriodId: lowestPeriodId,
    firstShortfallPeriodId,
    departmentOutflows: input.departments
      .filter((d) => departmentOutflows.has(d.id))
      .map((d) => ({
        departmentId: d.id,
        amount: centsToMoney(departmentOutflows.get(d.id) ?? ZERO),
      })),
    unscheduledInflow: centsToMoney(unscheduledInflow),
    unscheduledOutflow: centsToMoney(unscheduledOutflow),
  };
}
