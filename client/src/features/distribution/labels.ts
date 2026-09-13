import {
  distributionTerritoryStatusSchema,
  type DistributionTerritoryStatus,
} from "@shared/contracts";

export const distributionTerritoryStatuses =
  distributionTerritoryStatusSchema.options;

export const distributionTerritoryStatusLabels: Record<
  DistributionTerritoryStatus,
  string
> = {
  available: "Available",
  in_discussion: "In Discussion",
  licensed: "Licensed",
  delivered: "Delivered",
  closed: "Closed",
};
