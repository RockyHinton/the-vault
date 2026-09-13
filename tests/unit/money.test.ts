import { describe, expect, it } from "vitest";
import {
  centsToMoney,
  formatMoney,
  moneySchema,
  moneyToCents,
  normalizeMoney,
  sumMoney,
} from "@shared/contracts";

describe("money", () => {
  it("normalises authored amounts to two decimals and refuses malformed ones", () => {
    expect(moneySchema.parse("1200")).toBe("1200.00");
    expect(moneySchema.parse(" 1200.5 ")).toBe("1200.50");
    expect(moneySchema.parse("0")).toBe("0.00");
    for (const bad of [
      "",
      "-5",
      "1,200",
      "12.345",
      "1e3",
      "abc",
      "1234567890123",
    ]) {
      expect(moneySchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("adds exactly where floating point would not", () => {
    expect(sumMoney(["0.10", "0.20"])).toBe("0.30");
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney(["999999999999.99", "0.01"])).toBe("1000000000000.00");
    expect(sumMoney([])).toBe("0.00");
    expect(sumMoney(["45000000.00", "12000000.50", "0.50"])).toBe(
      "57000001.00",
    );
  });

  it("round-trips cents and formats without touching floats", () => {
    expect(moneyToCents("1234567.89")).toBe(BigInt(123456789));
    expect(centsToMoney(BigInt(5))).toBe("0.05");
    expect(centsToMoney(BigInt(-150))).toBe("-1.50");
    expect(normalizeMoney("7")).toBe("7.00");
    expect(formatMoney("1234567.80", "USD")).toBe("$1,234,567.80");
    expect(formatMoney("999.5", "GBP")).toBe("£999.50");
    expect(formatMoney("0.00", "EUR")).toBe("€0.00");
    expect(formatMoney("12345678901234.56", "USD")).toBe(
      "$12,345,678,901,234.56",
    );
  });
});
