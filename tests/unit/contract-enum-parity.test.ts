import { describe, expect, it } from "vitest";
import * as schema from "@shared/schema";
import {
  annotationTagSchema,
  annotationTypeSchema,
  archiveReasonSchema,
  budgetVersionStatusSchema,
  currencyCodeSchema,
  cashFlowDirectionSchema,
  cashFlowTimeframeSchema,
  distributionTerritoryStatusSchema,
  financeSourceStatusSchema,
  financeSourceTypeSchema,
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
  annotationTag,
  annotationType,
  applicationRole,
  archiveReason,
  budgetVersionStatus,
  currencyCode,
  cashFlowDirection,
  cashFlowTimeframe,
  distributionTerritoryStatus,
  financeSourceStatus,
  financeSourceType,
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

/** Every enum asserted against a contract above; the inventory test compares this to the schema. */
const coveredEnumNames = [
  annotationTag,
  annotationType,
  applicationRole,
  archiveReason,
  budgetVersionStatus,
  currencyCode,
  cashFlowDirection,
  cashFlowTimeframe,
  distributionTerritoryStatus,
  financeSourceStatus,
  financeSourceType,
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
].map((value) => value.enumName);

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

  it("finance enums match", () => {
    expect(currencyCodeSchema.options).toEqual(currencyCode.enumValues);
    expect(financeSourceTypeSchema.options).toEqual(
      financeSourceType.enumValues,
    );
    expect(cashFlowTimeframeSchema.options).toEqual(
      cashFlowTimeframe.enumValues,
    );
    expect(cashFlowDirectionSchema.options).toEqual(
      cashFlowDirection.enumValues,
    );
    expect(distributionTerritoryStatusSchema.options).toEqual(
      distributionTerritoryStatus.enumValues,
    );
    expect(financeSourceStatusSchema.options).toEqual(
      financeSourceStatus.enumValues,
    );
    expect(budgetVersionStatusSchema.options).toEqual(
      budgetVersionStatus.enumValues,
    );
  });

  it("script annotation enums match", () => {
    expect(annotationTypeSchema.options).toEqual(annotationType.enumValues);
    expect(annotationTagSchema.options).toEqual(annotationTag.enumValues);
  });
});

/**
 * Every pgEnum must either be matched to a contract schema above or be
 * listed here as server-internal, so a new enum cannot ship unnoticed.
 */
const serverInternalEnums = new Set([
  "file_object_status",
  "stage_history_transition",
]);

describe("enum inventory", () => {
  it("every pgEnum in the schema is covered by a parity assertion or declared server-internal", () => {
    const enumNames = Object.values(schema as Record<string, unknown>)
      .filter(
        (value): value is { enumName: string; enumValues: string[] } =>
          typeof value === "object" &&
          value !== null &&
          "enumName" in value &&
          "enumValues" in value,
      )
      .map((value) => value.enumName);
    const covered = new Set(
      Array.from(serverInternalEnums).concat(coveredEnumNames),
    );
    expect(enumNames.filter((name) => !covered.has(name))).toEqual([]);
  });
});
