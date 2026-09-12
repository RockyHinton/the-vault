import { clerkClient } from "@clerk/express";
import { log } from "../../observability/logger";

export interface IdentityProfile {
  email: string | null;
  displayName: string | null;
}

export type ProfileLookup = (clerkUserId: string) => Promise<IdentityProfile>;

/**
 * Reads a user's primary email and name from the Clerk backend API. Used only
 * when creating a local account (bootstrap), never on the request hot path.
 * Session tokens do not carry these claims by default, so this is the only
 * reliable source. Failures degrade to nulls; access decisions never depend
 * on this data.
 */
export const fetchClerkProfile: ProfileLookup = async (clerkUserId) => {
  try {
    const user = await clerkClient.users.getUser(clerkUserId);
    const email =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null;
    const name = [user.firstName, user.lastName]
      .filter((part): part is string => Boolean(part))
      .join(" ");
    return { email, displayName: name || user.username || null };
  } catch (error) {
    log("warn", "auth.clerk_profile_unavailable", {
      clerkUserId,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return { email: null, displayName: null };
  }
};
