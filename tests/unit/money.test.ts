import { describe, expect, it } from "vitest";
import {
  centsToMoney,
  formatMoney,
  groupMoney,
  moneySchema,
  moneyToCents,
  moneyTotalValueSchema,
  normalizeMoney,
  signedMoneyTotalValueSchema,
  storedMoneyValueSchema,
  sumMoney,
  type LegalRecord,
} from "@shared/contracts";
import { legalCategoryConfig } from "../../client/src/features/legal/categories";

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
    expect(formatMoney("-1234567.8", "GBP")).toBe("-£1,234,567.80");
    expect(groupMoney("-1234567.8")).toBe("-1,234,567.80");
  });

  it("a stored amount is exactly numeric(14,2); a derived total has its own explicit bound", () => {
    expect(storedMoneyValueSchema.safeParse("999999999999.99").success).toBe(
      true,
    );
    for (const bad of ["1000000000000.00", "1.5", "-1.00", "1e3", " 1.00"])
      expect(storedMoneyValueSchema.safeParse(bad).success, bad).toBe(false);

    // Eleven maximum line items already exceed thirteen integer digits.
    const eleven = sumMoney(Array(11).fill("999999999999.99"));
    expect(eleven).toBe("10999999999999.89");
    expect(moneyTotalValueSchema.safeParse(eleven).success).toBe(true);
    // The documented headroom: one million maximum stored amounts.
    const million = centsToMoney(
      moneyToCents("999999999999.99") * BigInt(1_000_000),
    );
    expect(moneyTotalValueSchema.safeParse(million).success).toBe(true);
    expect(
      moneyTotalValueSchema.safeParse("999999999999999999.99").success,
    ).toBe(true);
    for (const bad of ["1000000000000000000.00", "-1.00", "1.0", "1,000.00"])
      expect(moneyTotalValueSchema.safeParse(bad).success, bad).toBe(false);
    expect(
      signedMoneyTotalValueSchema.safeParse("-999999999999999999.99").success,
    ).toBe(true);
    expect(
      signedMoneyTotalValueSchema.safeParse("-1000000000000000000.00").success,
    ).toBe(false);
  });

  it("legal investment amounts are grouped exactly, never through Number", () => {
    const record: LegalRecord = {
      id: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
      category: "investment_agreements",
      name: "Northern Fund",
      notes: null,
      details: {
        category: "investment_agreements",
        investorType: "Fund",
        currency: "GBP",
        amount: "250000.50",
        commitment: "Closed",
      },
      documents: [],
      createdBy: {
        id: "33333333-3333-4333-8333-333333333333",
        displayName: "A",
      },
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    // Floating point would drop the trailing zero ("250,000.5").
    expect(Number("250000.50").toLocaleString("en-US")).toBe("250,000.5");
    expect(
      legalCategoryConfig.investment_agreements.secondaryLine?.(record),
    ).toBe("GBP 250,000.50 · Closed");
  });
});
