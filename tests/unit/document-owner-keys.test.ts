import { describe, expect, it } from "vitest";
import { documentOwnerQueryKeys } from "../../client/src/features/documents/document-owner-keys";
import { peopleKey } from "../../client/src/features/people/use-people";
import { rightsKey } from "../../client/src/features/rights/use-rights";
import { legalRecordsKey } from "../../client/src/features/legal/use-legal-records";
import { scriptsKey } from "../../client/src/features/scripts/use-scripts";
import { budgetKey } from "../../client/src/features/budget/use-budget";
import { financePlanKey } from "../../client/src/features/finance-plan/use-finance-plan";
import { territoriesKey } from "../../client/src/features/distribution/use-distribution";
import { queryClient } from "../../client/src/lib/queryClient";

/**
 * Every feature whose contract embeds `Document` must be in the owner list,
 * so a document mutation refreshes it. Adding an owner means adding it here.
 */
describe("document owner query keys", () => {
  it("cover every feature that embeds documents, by that feature's own root key", () => {
    const projectId = "11111111-1111-4111-8111-111111111111";
    const owners = documentOwnerQueryKeys(projectId).map((key) =>
      JSON.stringify(key),
    );
    for (const key of [
      peopleKey(projectId),
      rightsKey(projectId),
      legalRecordsKey(projectId),
      scriptsKey(projectId),
      budgetKey(projectId),
      financePlanKey(projectId),
      territoriesKey(projectId),
    ]) {
      expect(owners).toContain(JSON.stringify(key));
    }
    expect(owners).toHaveLength(7);
  });
});

describe("query client defaults", () => {
  it("has no default queryFn: every hook supplies its own typed function", () => {
    expect(queryClient.getDefaultOptions().queries?.queryFn).toBeUndefined();
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(Infinity);
  });
});
