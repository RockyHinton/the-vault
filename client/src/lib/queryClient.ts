import { QueryClient } from "@tanstack/react-query";

/**
 * Server state lives here. There is deliberately no default `queryFn`:
 * every domain hook under `client/src/features` imports its typed API
 * function and supplies its own, so a query can never fall back to fetching
 * an unvalidated URL built from its key.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
