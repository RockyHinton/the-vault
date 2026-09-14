import { describe, expect, it } from "vitest";
import {
  developmentBlockers,
  productionBlockers,
  type FinancingOverview,
  type LegalRecord,
  type Person,
  type ProductionReadinessInput,
} from "@shared/contracts";

const allGates = {
  scriptApproved: true,
  budgetApproved: true,
  financeApproved: true,
  talentAttached: true,
};

const record = (
  category: LegalRecord["category"],
  statuses: LegalRecord["documents"][number]["status"][],
) =>
  ({
    category,
    documents: statuses.map((status) => ({ status })),
  }) as unknown as LegalRecord;

const committedCast = {
  creativeRoleType: "cast",
  engagement: { status: "confirmed" },
} as unknown as Person;

const financing = (overrides: {
  locked?: boolean;
  fundingGap?: string | null;
  shortfall?: string | null;
}): FinancingOverview =>
  ({
    currency: "GBP",
    budget: { lockedVersion: overrides.locked === false ? null : { id: "v1" } },
    financePlan:
      overrides.fundingGap === null
        ? null
        : { summary: { fundingGap: overrides.fundingGap ?? "0.00" } },
    cashFlow: overrides.shortfall
      ? { firstShortfallPeriodLabel: overrides.shortfall }
      : null,
  }) as unknown as FinancingOverview;

const ready = (): ProductionReadinessInput => ({
  financing: financing({}),
  legalRecords: [record("chain_of_title", ["signed"])],
  creatives: [committedCast],
});
const codes = (input: ProductionReadinessInput) =>
  productionBlockers(input).map((blocker) => blocker.code);

describe("stage readiness", () => {
  it("Evaluation → Development requires every decision-checklist gate", () => {
    expect(developmentBlockers(allGates)).toEqual([]);
    const blockers = developmentBlockers({
      ...allGates,
      talentAttached: false,
    });
    expect(blockers).toEqual([
      {
        code: "EVALUATION_GATE_UNMET",
        area: "evaluation",
        message: "Decision checklist: Talent attached is not met.",
      },
    ]);
    expect(
      developmentBlockers({
        scriptApproved: false,
        budgetApproved: false,
        financeApproved: false,
        talentAttached: false,
      }),
    ).toHaveLength(4);
  });

  it("Development → Production has no blocker when finance, legal and talent are ready", () => {
    expect(productionBlockers(ready())).toEqual([]);
  });

  it("names each production blocker the Development screen presents", () => {
    expect(
      codes({
        financing: financing({ locked: false }),
        legalRecords: [],
        creatives: [],
      }),
    ).toEqual([
      "BUDGET_NOT_LOCKED",
      "CHAIN_OF_TITLE_INCOMPLETE",
      "TALENT_NOT_CONFIRMED",
    ]);
    expect(
      codes({ ...ready(), financing: financing({ fundingGap: null }) }),
    ).toEqual(["FINANCE_PLAN_MISSING"]);
    expect(
      productionBlockers({
        ...ready(),
        financing: financing({ fundingGap: "1500.50" }),
      }),
    ).toEqual([
      {
        code: "FUNDING_GAP",
        area: "finance",
        message: "Funding gap of £1,500.50 remains.",
      },
    ]);
    expect(
      codes({ ...ready(), financing: financing({ shortfall: "Mar 2027" }) }),
    ).toEqual(["CASH_FLOW_SHORTFALL"]);
    expect(
      codes({
        ...ready(),
        legalRecords: [record("chain_of_title", ["signed", "draft"])],
      }),
    ).toEqual(["CHAIN_OF_TITLE_INCOMPLETE"]);
    expect(
      codes({
        ...ready(),
        legalRecords: [
          record("chain_of_title", ["final"]),
          record("cast_agreements", ["under_review"]),
        ],
      }),
    ).toEqual(["CAST_AGREEMENTS_PENDING"]);
    // Creatives without a committed cast member are "partial", which does not block.
    expect(
      codes({
        ...ready(),
        creatives: [
          {
            creativeRoleType: "director",
            engagement: { status: "attached" },
          } as unknown as Person,
        ],
      }),
    ).toEqual([]);
  });
});
