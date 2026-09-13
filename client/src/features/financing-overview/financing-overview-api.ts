import { apiSuccessSchema, financingOverviewSchema } from "@shared/contracts";
import { apiClient } from "@/lib/api-client";

export const getFinancingOverview = (projectId: string) =>
  apiClient(
    "GET",
    `/projects/${projectId}/financing-overview`,
    apiSuccessSchema(financingOverviewSchema),
  );
