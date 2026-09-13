import { useQuery } from "@tanstack/react-query";
import { getFinancingOverview } from "./financing-overview-api";

export const financingOverviewKey = (projectId: string) =>
  ["financing-overview", projectId] as const;

/** Read-only, derived on the server from Budget, Finance Plan and Cash Flow. */
export function useFinancingOverview(projectId: string) {
  return useQuery({
    queryKey: financingOverviewKey(projectId),
    queryFn: () => getFinancingOverview(projectId),
  });
}
