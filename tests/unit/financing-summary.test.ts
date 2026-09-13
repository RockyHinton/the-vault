import { describe, expect, it } from "vitest";
import { summarizeFinancing } from "@shared/contracts";

describe("summarizeFinancing", () => {
  it("splits totals by status exactly and derives the gap from approved financing only", () => {
    const summary = summarizeFinancing({
      budgetTotal: "1234568.19",
      sources: [
        { status: "targeted", amount: "0.10" },
        { status: "targeted", amount: "0.20" },
        { status: "soft_committed", amount: "500000.00" },
        { status: "approved", amount: "700000.19" },
        { status: "approved", amount: "34568.00" },
      ],
    });
    expect(summary).toEqual({
      budgetTotal: "1234568.19",
      targetedTotal: "0.30",
      softCommittedTotal: "500000.00",
      approvedTotal: "734568.19",
      committedTotal: "1234568.19",
      fundingGap: "500000.00",
      overFinancedBy: "0.00",
    });
  });

  it("handles zero financing, exact equality, over-financing and large values", () => {
    expect(
      summarizeFinancing({ budgetTotal: "100.00", sources: [] }).fundingGap,
    ).toBe("100.00");
    const exact = summarizeFinancing({
      budgetTotal: "100.00",
      sources: [{ status: "approved", amount: "100" }],
    });
    expect(exact.fundingGap).toBe("0.00");
    expect(exact.overFinancedBy).toBe("0.00");
    const over = summarizeFinancing({
      budgetTotal: "99.99",
      sources: [{ status: "approved", amount: "100.00" }],
    });
    expect(over).toMatchObject({ fundingGap: "0.00", overFinancedBy: "0.01" });
    const large = summarizeFinancing({
      budgetTotal: "999999999999.99",
      sources: [{ status: "approved", amount: "999999999999.98" }],
    });
    expect(large.fundingGap).toBe("0.01");
    expect(
      summarizeFinancing({ budgetTotal: "0.00", sources: [] }).committedTotal,
    ).toBe("0.00");
  });
});
