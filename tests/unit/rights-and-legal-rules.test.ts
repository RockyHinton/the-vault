import { describe, expect, it } from "vitest";
import {
  defaultRightsStatusForStage,
  isLegalRecordConfirmed,
  isRightsStatusAllowedForStage,
  legalDetailsSchema,
  rightsStatusesByStage,
  rightsStatusValues,
  summarizeLegalCategory,
  summarizeRightsForStage,
} from "@shared/contracts";

describe("rights status vocabulary per stage", () => {
  it("every stage list is drawn from the single status enum", () => {
    for (const statuses of Object.values(rightsStatusesByStage)) {
      for (const status of statuses)
        expect(rightsStatusValues).toContain(status);
    }
    expect(defaultRightsStatusForStage("evaluation")).toBe("identified");
    expect(defaultRightsStatusForStage("production")).toBe("cleared");
  });

  it("allows a status only in the stages that use it", () => {
    expect(isRightsStatusAllowedForStage("evaluation", "optioned")).toBe(true);
    expect(isRightsStatusAllowedForStage("development", "optioned")).toBe(true);
    expect(isRightsStatusAllowedForStage("production", "optioned")).toBe(false);
    expect(isRightsStatusAllowedForStage("evaluation", "cleared")).toBe(false);
  });

  it("summarises the page position per stage", () => {
    expect(summarizeRightsForStage("evaluation", [])).toBe("none");
    expect(
      summarizeRightsForStage("evaluation", ["optioned", "optioned"]),
    ).toBe("cleared");
    expect(
      summarizeRightsForStage("evaluation", ["optioned", "contacted"]),
    ).toBe("in_progress");
    expect(
      summarizeRightsForStage("evaluation", ["optioned", "not_available"]),
    ).toBe("at_risk");
    expect(summarizeRightsForStage("development", ["purchased"])).toBe(
      "cleared",
    );
    expect(
      summarizeRightsForStage("development", ["rights_issue", "purchased"]),
    ).toBe("at_risk");
    expect(
      summarizeRightsForStage("production", ["cleared", "chain_complete"]),
    ).toBe("cleared");
    expect(
      summarizeRightsForStage("production", ["cleared", "missing_doc"]),
    ).toBe("at_risk");
    // A status left over from an earlier stage is neither secured nor at risk here.
    expect(summarizeRightsForStage("production", ["optioned"])).toBe(
      "in_progress",
    );
  });
});

describe("legal documentation completion", () => {
  it("confirms a record only when every attached document is signed or final", () => {
    expect(isLegalRecordConfirmed([])).toBe(false);
    expect(isLegalRecordConfirmed(["draft"])).toBe(false);
    expect(isLegalRecordConfirmed(["signed", "under_review"])).toBe(false);
    expect(isLegalRecordConfirmed(["signed"])).toBe(true);
    expect(isLegalRecordConfirmed(["final", "signed"])).toBe(true);
  });

  it("derives the category overview from the records", () => {
    expect(summarizeLegalCategory([])).toEqual({
      total: 0,
      confirmed: 0,
      pending: 0,
      completion: "empty",
    });
    expect(
      summarizeLegalCategory([
        { documentStatuses: ["signed"] },
        { documentStatuses: ["draft"] },
        { documentStatuses: [] },
      ]),
    ).toEqual({
      total: 3,
      confirmed: 1,
      pending: 2,
      completion: "in_progress",
    });
    expect(
      summarizeLegalCategory([
        { documentStatuses: ["signed"] },
        { documentStatuses: ["final", "final"] },
      ]),
    ).toEqual({ total: 2, confirmed: 2, pending: 0, completion: "completed" });
  });
});

/** One representative valid and one invalid detail set per legal category. */
const detailCases: {
  valid: Record<string, unknown>;
  invalid: Record<string, unknown>;
}[] = [
  {
    valid: {
      category: "chain_of_title",
      holder: "Estate of A. Author",
      rightsType: "Option",
    },
    invalid: { category: "chain_of_title", holder: "", rightsType: "Option" },
  },
  {
    valid: {
      category: "writer_agreements",
      role: "Co-writer",
      email: "w@example.com",
    },
    invalid: { category: "writer_agreements", role: "Ghost" },
  },
  {
    valid: {
      category: "investment_agreements",
      investorType: "Fund",
      currency: "GBP",
      amount: "250000.50",
      commitment: "Closed",
    },
    invalid: {
      category: "investment_agreements",
      investorType: "Fund",
      currency: "GBP",
      amount: "£250k",
      commitment: "Closed",
    },
  },
  {
    valid: { category: "co_production", country: "Ireland" },
    invalid: { category: "co_production", email: "not-an-email" },
  },
  {
    valid: { category: "producers_agreements", role: "Line Producer" },
    invalid: { category: "producers_agreements", role: "Showrunner" },
  },
  {
    valid: { category: "director_agreements" },
    invalid: { category: "director_agreements", email: 5 },
  },
  {
    valid: {
      category: "cast_agreements",
      role: "Detective Kaito",
      castType: "Lead",
      fee: "50000",
    },
    invalid: {
      category: "cast_agreements",
      role: "Detective Kaito",
      castType: "Cameo",
    },
  },
  {
    valid: { category: "banking_docs", purpose: "Escrow" },
    invalid: { category: "banking_docs", purpose: "Savings" },
  },
  {
    valid: {
      category: "funding_tax_credit",
      fundingType: "Tax Credit",
      expectedAmount: "1000000",
    },
    invalid: {
      category: "funding_tax_credit",
      fundingType: "Tax Credit",
      expectedAmount: "1,000,000",
    },
  },
  {
    valid: { category: "sales_agency", territory: "Worldwide ex-UK" },
    invalid: { category: "sales_agency", territory: 42 },
  },
  {
    valid: { category: "cama" },
    invalid: { category: "cama", contactName: "x".repeat(201) },
  },
];

describe("legal details schemas", () => {
  it.each(detailCases)(
    "validates $valid.category details",
    ({ valid, invalid }) => {
      expect(legalDetailsSchema.safeParse(valid).success).toBe(true);
      expect(legalDetailsSchema.safeParse(invalid).success).toBe(false);
    },
  );

  it("rejects an unknown category and a category-less object", () => {
    expect(
      legalDetailsSchema.safeParse({ category: "insurance" }).success,
    ).toBe(false);
    expect(legalDetailsSchema.safeParse({ holder: "x" }).success).toBe(false);
  });
});
