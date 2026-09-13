import { describe, expect, it } from "vitest";
import {
  dateFromDayNumber,
  dayNumber,
  projectCashFlow,
  sumMoney,
} from "@shared/contracts";

const base = {
  timeframe: "monthly" as const,
  today: "2026-01-15",
  openingBalance: "0.00",
  departments: [],
  payments: [],
  inflows: [],
};

describe("projectCashFlow", () => {
  it("spreads a department total exactly across its window and lands inflows in their period", () => {
    const projection = projectCashFlow({
      ...base,
      openingBalance: "0.10",
      departments: [
        {
          id: "prod",
          total: "1000000.01",
          window: { startDate: "2026-01-20", endDate: "2026-04-10" },
        },
        { id: "post", total: "500.00", window: null },
      ],
      payments: [
        {
          departmentId: "prod",
          amount: "0.20",
          direction: "outflow",
          date: "2026-02-28",
        },
      ],
      inflows: [
        { id: "equity", amount: "999999.99", scheduledDate: "2026-02-01" },
        { id: "grant", amount: "123.45", scheduledDate: null },
      ],
    });
    const byId = Object.fromEntries(projection.periods.map((p) => [p.id, p]));
    expect(projection.periods[0].id).toBe("2026-01");
    expect(projection.periods.at(-1)?.id).toBe("2026-07");
    // The spread sums exactly to the department total, never a cent off.
    expect(sumMoney(projection.periods.map((p) => p.outflow))).toBe(
      "1000000.21",
    );
    expect(projection.departmentOutflows).toEqual([
      { departmentId: "prod", amount: "1000000.21" },
    ]);
    expect(byId["2026-02"].inflow).toBe("999999.99");
    expect(byId["2026-01"].closingBalance).toBe("-148148.04");
    expect(projection.unscheduledInflow).toBe("123.45");
    expect(projection.unscheduledOutflow).toBe("500.00");
    expect(projection.firstShortfallPeriodId).toBe("2026-01");
    expect(projection.totalInflow).toBe("999999.99");
    expect(projection.totalOutflow).toBe("1000000.21");
    expect(projection.closingBalance).toBe("-0.12");
    expect(projection.lowestBalance).toBe("-148148.04");
    expect(projection.lowestBalancePeriodId).toBe("2026-01");
    // 81-day window: January (12 days) gets floor(total × 12 ÷ 81) = 148148.14.
    expect(byId["2026-01"].outflow).toBe("148148.14");
  });

  it("adds cents exactly (0.10 + 0.20) and handles large values and a zero cash flow", () => {
    const small = projectCashFlow({
      ...base,
      inflows: [
        { id: "a", amount: "0.10", scheduledDate: "2026-01-03" },
        { id: "b", amount: "0.20", scheduledDate: "2026-01-04" },
      ],
    });
    expect(small.periods[0].inflow).toBe("0.30");
    expect(small.closingBalance).toBe("0.30");
    const large = projectCashFlow({
      ...base,
      openingBalance: "999999999999.99",
      departments: [
        {
          id: "d",
          total: "999999999999.99",
          window: { startDate: "2026-01-01", endDate: "2026-01-31" },
        },
      ],
    });
    expect(large.periods[0].outflow).toBe("999999999999.99");
    expect(large.periods[0].closingBalance).toBe("0.00");
    const empty = projectCashFlow(base);
    expect(empty.periods).toHaveLength(4);
    expect(empty.closingBalance).toBe("0.00");
    expect(empty.firstShortfallPeriodId).toBeNull();
  });

  it("generates deterministic Monday-start weeks and month boundaries without a time zone", () => {
    expect(dayNumber("1970-01-01")).toBe(0);
    expect(dateFromDayNumber(dayNumber("2024-02-29"))).toBe("2024-02-29");
    const weekly = projectCashFlow({
      ...base,
      timeframe: "weekly",
      today: "2026-01-01",
      inflows: [{ id: "a", amount: "1.00", scheduledDate: "2026-01-04" }],
    });
    expect(weekly.periods[0]).toMatchObject({
      id: "2025-12-29",
      startDate: "2025-12-29",
      endDate: "2026-01-04",
      inflow: "1.00",
    });
    expect(weekly.periods[1].startDate).toBe("2026-01-05");
    const leap = projectCashFlow({
      ...base,
      today: "2024-02-10",
      departments: [
        {
          id: "d",
          total: "29.00",
          window: { startDate: "2024-02-01", endDate: "2024-02-29" },
        },
      ],
    });
    expect(leap.periods[0]).toMatchObject({
      id: "2024-02",
      endDate: "2024-02-29",
      outflow: "29.00",
    });
    // A window that spans a month boundary splits by days: 10 of 31 in January.
    const split = projectCashFlow({
      ...base,
      departments: [
        {
          id: "d",
          total: "31.00",
          window: { startDate: "2026-01-22", endDate: "2026-02-21" },
        },
      ],
    });
    expect(split.periods[0].outflow).toBe("10.00");
    expect(split.periods[1].outflow).toBe("21.00");
  });
});
