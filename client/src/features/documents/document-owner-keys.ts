import type { QueryKey } from "@tanstack/react-query";

/**
 * Every query family that embeds `Document` contracts. A document mutation
 * (metadata edit, new version, delete) invalidates all of them, so an owner
 * screen never shows a stale title, status or version for the rest of the
 * session. Each entry is the owner feature's root key; the unit test in
 * `tests/unit/document-owner-keys.test.ts` pins this list to those key
 * functions, so adding an owner without listing it here fails the build's
 * tests rather than a user's afternoon.
 */
export function documentOwnerQueryKeys(projectId: string): QueryKey[] {
  return [
    ["people", projectId],
    ["rights", projectId],
    ["legal-records", projectId],
    ["scripts", projectId],
    ["budget", projectId],
    ["finance-plan", projectId],
    ["distribution", projectId],
  ];
}
