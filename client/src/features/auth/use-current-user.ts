import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { getCurrentUser } from "./auth-api";

export function useCurrentUser() {
  const { isLoaded, isSignedIn } = useAuth();
  const testIdentityEnabled =
    import.meta.env.MODE === "test" &&
    Boolean(
      (window as Window & { __VAULT_TEST_IDENTITY__?: unknown })
        .__VAULT_TEST_IDENTITY__,
    );
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
    enabled: testIdentityEnabled || (isLoaded && isSignedIn),
    retry: false,
    staleTime: 60_000,
  });
}
