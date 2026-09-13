import type { DocumentStatus } from "./api";

/**
 * The product rule for legal documentation, unchanged from the validated
 * prototype: a record is confirmed when it has at least one attached document
 * and every attached document's current version is signed or final. A
 * category is empty with no records, completed when every record is
 * confirmed, otherwise in progress. Nothing here is stored; it is derived
 * from the authoritative records and documents wherever it is shown.
 */
const confirmingStatuses: readonly DocumentStatus[] = ["signed", "final"];

export function isLegalRecordConfirmed(
  documentStatuses: readonly DocumentStatus[],
): boolean {
  return (
    documentStatuses.length > 0 &&
    documentStatuses.every((status) => confirmingStatuses.includes(status))
  );
}

export type LegalCategoryCompletion = "empty" | "in_progress" | "completed";

export interface LegalCategoryOverview {
  total: number;
  confirmed: number;
  pending: number;
  completion: LegalCategoryCompletion;
}

export function summarizeLegalCategory(
  records: readonly { documentStatuses: readonly DocumentStatus[] }[],
): LegalCategoryOverview {
  const total = records.length;
  const confirmed = records.filter((record) =>
    isLegalRecordConfirmed(record.documentStatuses),
  ).length;
  const pending = total - confirmed;
  return {
    total,
    confirmed,
    pending,
    completion:
      total === 0 ? "empty" : pending === 0 ? "completed" : "in_progress",
  };
}
