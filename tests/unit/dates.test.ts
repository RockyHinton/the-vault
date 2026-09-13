import { describe, expect, it } from "vitest";
import { isCalendarDate, isoDateSchema } from "@shared/contracts";

describe("isoDateSchema", () => {
  it("accepts real calendar dates, including a leap day", () => {
    for (const value of [
      "2026-01-31",
      "2024-02-29",
      "2000-02-29",
      "2026-12-31",
    ]) {
      expect(isoDateSchema.safeParse(value).success, value).toBe(true);
      expect(isCalendarDate(value)).toBe(true);
    }
    expect(isoDateSchema.parse(" 2026-03-15 ")).toBe("2026-03-15");
  });

  it("rejects impossible dates and malformed shapes without touching a time zone", () => {
    for (const value of [
      "2026-02-30",
      "2026-02-29",
      "1900-02-29",
      "2026-04-31",
      "2026-13-01",
      "2026-00-10",
      "2026-01-00",
      "2026-1-5",
      "20260105",
      "2026-01-05T00:00:00Z",
      "Q4 2026",
      "",
    ]) {
      expect(isoDateSchema.safeParse(value).success, value).toBe(false);
    }
  });
});
