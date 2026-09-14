import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LoginInput } from "@shared/contracts";
import { login, logout } from "./auth-api";
import { currentUserKey } from "./use-current-user";

/** Everything cached belongs to the previous identity; start clean. */
function resetClientState(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.clear();
}

/** Login errors are shown inline by the form, so this hook does not toast. */
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: (session) => {
      resetClientState(queryClient);
      queryClient.setQueryData(currentUserKey, session);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => logout(),
    onSettled: () => resetClientState(queryClient),
  });
}
