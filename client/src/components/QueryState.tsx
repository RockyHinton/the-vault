import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

interface QueryStateProps {
  /** One or more queries the surface depends on; loading or error in any of them wins. */
  queries: Pick<UseQueryResult, "isLoading" | "isError">[];
  loading: string;
  error: string;
  children: ReactNode;
}

/**
 * Loading is not empty, and an error is not empty: a surface renders its
 * business content only after every query it depends on has succeeded, so
 * an outage can never read as "nothing here yet".
 */
export function QueryState({ queries, loading, error, children }: QueryStateProps) {
  if (queries.some((q) => q.isError))
    return (
      <p className="text-sm text-destructive py-8 text-center" role="alert">
        {error}
      </p>
    );
  if (queries.some((q) => q.isLoading))
    return <p className="text-sm text-muted-foreground py-8 text-center">{loading}</p>;
  return <>{children}</>;
}
