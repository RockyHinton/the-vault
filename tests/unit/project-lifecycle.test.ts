import { describe, expect, it } from "vitest";
import { canTransitionProjectStage } from "../../server/modules/projects/project-lifecycle";

describe("project lifecycle", () => {
  it("allows only forward active-stage transitions", () => {
    expect(canTransitionProjectStage("evaluation", "development")).toBe(true);
    expect(canTransitionProjectStage("development", "production")).toBe(true);
    expect(canTransitionProjectStage("production", "evaluation")).toBe(false);
    expect(canTransitionProjectStage("development", "evaluation")).toBe(false);
  });
});
