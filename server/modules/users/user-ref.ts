import type { UserRef } from "@shared/contracts";

/**
 * The safe identity shape used for authorship and assignment across domains.
 * Display name falls back to the email address so callers always have a
 * human-readable label; nothing else about the user is exposed.
 */
export function toUserRef(user: {
  id: string;
  displayName: string | null;
  email: string;
}): UserRef {
  return { id: user.id, displayName: user.displayName ?? user.email };
}

/** The columns a repository must select to build a UserRef. */
export interface UserRefColumns {
  id: string;
  displayName: string | null;
  email: string;
}
