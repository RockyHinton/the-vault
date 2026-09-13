import { describe, expect, it } from "vitest";
import { auditActions } from "../../server/modules/audit/audit-actions";

/** The two legacy `.set` names are documented exceptions; everything else is `<entity>.<past-tense>`. */
const legacy = new Set([
  "cash_flow_department_window.set",
  "cash_flow_source_timing.set",
]);

describe("audit vocabulary", () => {
  it("is unique, dot-namespaced and past tense apart from the documented legacy names", () => {
    expect(new Set(auditActions).size).toBe(auditActions.length);
    for (const action of auditActions) {
      expect(action).toMatch(/^[a-z_]+\.[a-z_]+$/);
      if (!legacy.has(action)) expect(action).toMatch(/(ed|login|logout)$/);
    }
  });
});
