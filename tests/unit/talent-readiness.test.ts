import { describe, expect, it } from "vitest";
import type { Person } from "@shared/contracts";
import { talentReadiness } from "../../client/src/features/people/readiness";

const person = (
  creativeRoleType: Person["creativeRoleType"],
  status: Person["engagement"]["status"],
): Person =>
  ({
    creativeRoleType,
    engagement: { status },
  }) as unknown as Person;

describe("talentReadiness", () => {
  it("is incomplete with no creatives, partial without committed cast, ready with committed cast", () => {
    expect(talentReadiness([]).status).toBe("Incomplete");
    expect(
      talentReadiness([
        person("cast", "identified"),
        person("head_of_department", "attached"),
      ]).status,
    ).toBe("Partial");
    expect(talentReadiness([person("cast", "confirmed")]).status).toBe("Ready");
    expect(
      talentReadiness([
        person("cast", "unavailable_passed"),
        person("cast", "offered"),
      ]).reason,
    ).toBe("1 cast member has committed.");
  });
});
