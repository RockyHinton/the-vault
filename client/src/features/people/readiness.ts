import type { Person } from "@shared/contracts";

export type TalentReadiness = "Ready" | "Partial" | "Incomplete";

/**
 * The Development stage's talent gate, stated as a rule rather than a
 * count. A project is talent-ready when at least one cast member has a
 * committed engagement; it is partial while creatives are attached but no
 * cast member has committed; it is incomplete with no creatives at all.
 * "Committed" is the same set the People page uses for its attention
 * heuristics: offered, confirmed, contracted or attached.
 */
export const committedEngagementStatuses = new Set<
  NonNullable<Person["engagement"]["status"]>
>(["offered", "confirmed", "contracted", "attached"]);

export function talentReadiness(creatives: readonly Person[]): {
  status: TalentReadiness;
  reason: string;
} {
  const committedCast = creatives.filter(
    (person) =>
      person.creativeRoleType === "cast" &&
      person.engagement.status !== null &&
      committedEngagementStatuses.has(person.engagement.status),
  );
  if (committedCast.length > 0)
    return {
      status: "Ready",
      reason: `${committedCast.length} cast ${committedCast.length === 1 ? "member has" : "members have"} committed.`,
    };
  if (creatives.length > 0)
    return {
      status: "Partial",
      reason: `${creatives.length} creative${creatives.length === 1 ? "" : "s"} attached; no cast member has committed yet.`,
    };
  return { status: "Incomplete", reason: "No creatives attached yet." };
}
