import {
  contractStatusSchema,
  creativeRoleTypeSchema,
  engagementStatusSchema,
  type ContractStatus,
  type CreativeRoleType,
  type EngagementStatus,
  type Person,
  type PersonKind,
} from "@shared/contracts";

export const engagementStatuses = engagementStatusSchema.options;
export const contractStatuses = contractStatusSchema.options;
export const creativeRoleTypes = creativeRoleTypeSchema.options;

export const engagementStatusLabels: Record<EngagementStatus, string> = {
  identified: "Identified",
  contacted: "Contacted",
  interested: "Interested",
  offered: "Offered",
  confirmed: "Confirmed",
  contracted: "Contracted",
  attached: "Attached",
  unavailable_passed: "Unavailable / Passed",
};
export const NOT_SET_LABEL = "Not set";
export const engagementStatusLabel = (status: EngagementStatus | null) =>
  status ? engagementStatusLabels[status] : NOT_SET_LABEL;

export const contractStatusLabels: Record<ContractStatus, string> = {
  not_sent: "Not sent",
  sent: "Sent",
  signed: "Signed",
  pending_amendments: "Pending amendments",
};

export const creativeRoleTypeLabels: Record<CreativeRoleType, string> = {
  director: "Director",
  cast: "Cast",
  head_of_department: "Head of Department",
};

export const personKindLabels: Record<
  PersonKind,
  { singular: string; plural: string }
> = {
  producer: { singular: "Producer", plural: "Producers" },
  creative: { singular: "Creative", plural: "Creatives" },
};

export type AttentionReason =
  "Contract pending" | "Missing docs" | "Needs approval";

const committed = new Set<EngagementStatus>([
  "offered",
  "confirmed",
  "contracted",
  "attached",
]);
const settled = new Set<EngagementStatus>([
  "contracted",
  "attached",
  "unavailable_passed",
]);

/**
 * The prototype's attention heuristics, now over server state: a committed
 * status without a signed contract, no signed/final document, or a status
 * that still needs a decision.
 */
export function attentionReasons(person: Person): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  const { status, contractStatus } = person.engagement;
  if (
    status &&
    committed.has(status) &&
    contractStatus &&
    contractStatus !== "signed"
  ) {
    reasons.push("Contract pending");
  }
  if (
    !person.documents.some((d) => d.status === "signed" || d.status === "final")
  ) {
    reasons.push("Missing docs");
  }
  if (status && !settled.has(status)) reasons.push("Needs approval");
  return reasons;
}

export type StatusTone = "positive" | "pending" | "attention";
export function statusTone(status: EngagementStatus | null): StatusTone {
  if (status === "contracted" || status === "attached") return "positive";
  if (status === "offered" || status === "confirmed") return "pending";
  return "attention";
}

export function statusBadgeVariant(
  status: EngagementStatus | null,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "contracted" || status === "attached") return "default";
  if (status === "unavailable_passed") return "destructive";
  if (status === "offered" || status === "confirmed" || status === "interested")
    return "secondary";
  return "outline";
}
