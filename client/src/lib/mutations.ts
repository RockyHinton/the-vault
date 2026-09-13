import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiClientError } from "./api-client";

export interface VaultMutationOptions<TVariables, TData> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** Query keys to invalidate after success. */
  invalidate?: (variables: TVariables, data: TData) => QueryKey[];
  /**
   * Query keys to refetch when the server answers 409 (stale version or a
   * state rule such as "already archived"), so the UI shows current data
   * instead of the stale copy the user was editing. Defaults to `invalidate`.
   */
  onConflictInvalidate?: (variables: TVariables) => QueryKey[];
  successMessage?: string | ((data: TData, variables: TVariables) => string);
  /** Shown when the error carries no usable message. */
  fallbackErrorMessage?: string;
}

/**
 * The one mutation pattern every domain copies: invalidate on success, refetch
 * on conflict, one toast per outcome. Callers still receive the error from
 * `mutateAsync` if they need to react (for example, keep a dialog open).
 */
export function useVaultMutation<TVariables, TData>(
  options: VaultMutationOptions<TVariables, TData>,
) {
  const queryClient = useQueryClient();
  const invalidateAll = (keys: QueryKey[]) => {
    for (const queryKey of keys)
      void queryClient.invalidateQueries({ queryKey });
  };
  return useMutation({
    mutationFn: options.mutationFn,
    onSuccess: (data, variables) => {
      invalidateAll(options.invalidate?.(variables, data) ?? []);
      const message =
        typeof options.successMessage === "function"
          ? options.successMessage(data, variables)
          : options.successMessage;
      if (message) toast.success(message);
    },
    onError: (error, variables) => {
      if (error instanceof ApiClientError && error.status === 409) {
        invalidateAll(
          options.onConflictInvalidate?.(variables) ??
            options.invalidate?.(variables, undefined as TData) ??
            [],
        );
      }
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : (options.fallbackErrorMessage ??
              "The request could not be completed."),
      );
    },
  });
}
