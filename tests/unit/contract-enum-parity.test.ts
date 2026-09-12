import { describe, expect, it } from "vitest";
import {
  archiveReasonSchema,
  localUserSchema,
  projectStageSchema,
  revisitDispositionSchema,
} from "@shared/contracts";
import {
  applicationRole,
  archiveReason,
  projectStage,
  revisitDisposition,
  userStatus,
} from "@shared/schema";

// The API contracts deliberately do not import Drizzle (they ship to the
// browser), so enum values are declared twice. This keeps them identical.
describe("contract and schema enum parity", () => {
  it("project stages match", () => {
    expect(projectStageSchema.options).toEqual(projectStage.enumValues);
  });

  it("archive reasons match", () => {
    expect(archiveReasonSchema.options).toEqual(archiveReason.enumValues);
  });

  it("revisit dispositions match", () => {
    expect(revisitDispositionSchema.options).toEqual(
      revisitDisposition.enumValues,
    );
  });

  it("user roles and statuses match", () => {
    expect(localUserSchema.shape.role.options).toEqual(
      applicationRole.enumValues,
    );
    expect(localUserSchema.shape.status.options).toEqual(userStatus.enumValues);
  });
});
