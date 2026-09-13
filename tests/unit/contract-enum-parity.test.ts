import { describe, expect, it } from "vitest";
import {
  archiveReasonSchema,
  contractStatusSchema,
  creativeRoleTypeSchema,
  documentStatusSchema,
  engagementStatusSchema,
  financeTypeSchema,
  legalCategorySchema,
  localUserSchema,
  noteCategorySchema,
  personKindSchema,
  projectStageSchema,
  reviewRecommendationSchema,
  revisitDispositionSchema,
  rightsStatusSchema,
  rightsTypeSchema,
  taskCategorySchema,
  taskPrioritySchema,
  taskStatusSchema,
} from "@shared/contracts";
import {
  applicationRole,
  archiveReason,
  contractStatus,
  creativeRoleType,
  documentStatus,
  engagementStatus,
  financeType,
  legalCategory,
  noteCategory,
  personKind,
  projectStage,
  reviewRecommendation,
  revisitDisposition,
  rightsStatus,
  rightsType,
  taskCategory,
  taskPriority,
  taskStatus,
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

  it("document, evaluation, note and task enums match", () => {
    expect(documentStatusSchema.options).toEqual(documentStatus.enumValues);
    expect(financeTypeSchema.options).toEqual(financeType.enumValues);
    expect(reviewRecommendationSchema.options).toEqual(
      reviewRecommendation.enumValues,
    );
    expect(noteCategorySchema.options).toEqual(noteCategory.enumValues);
    expect(taskCategorySchema.options).toEqual(taskCategory.enumValues);
    expect(taskPrioritySchema.options).toEqual(taskPriority.enumValues);
    expect(taskStatusSchema.options).toEqual(taskStatus.enumValues);
  });

  it("people, rights and legal enums match", () => {
    expect(personKindSchema.options).toEqual(personKind.enumValues);
    expect(creativeRoleTypeSchema.options).toEqual(creativeRoleType.enumValues);
    expect(engagementStatusSchema.options).toEqual(engagementStatus.enumValues);
    expect(contractStatusSchema.options).toEqual(contractStatus.enumValues);
    expect(rightsTypeSchema.options).toEqual(rightsType.enumValues);
    expect(rightsStatusSchema.options).toEqual(rightsStatus.enumValues);
    expect(legalCategorySchema.options).toEqual(legalCategory.enumValues);
  });
});
