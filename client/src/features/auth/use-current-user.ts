import { useQuery } from "@tanstack/react-query";
import { getCurrentUser } from "./auth-api";

export const currentUserKey = ["auth", "me"] as const;

/**
 * The signed-in user, resolved from the session cookie by the server.
 * 401 means "not signed in"; 403 means the session exists but access is
 * refused (suspended). Login and logout replace or clear this query
 * explicitly, so an errored result is left alone until then: React Query
 * would otherwise flip a data-less errored query back to pending on every
 * observer mount and make the route guard loop.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserKey,
    queryFn: getCurrentUser,
    retry: false,
    retryOnMount: false,
    staleTime: 60_000,
  });
}

/**
 * UX gating only: hides administrative navigation and actions from ordinary
 * users. The server enforces every permission independently. Callers sit
 * behind `ProtectedRoute`, which renders nothing until the session resolves
 * and leaves for the sign-in page when it cannot, so `false` here always
 * means "a signed-in ordinary user", never "unknown".
 */
export function useIsStudioAdmin(): boolean {
  const { data } = useCurrentUser();
  return data?.data.user.role === "studio_admin";
}
