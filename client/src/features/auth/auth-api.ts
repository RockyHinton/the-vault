import { apiSuccessSchema, meSchema } from "@shared/contracts";
import { apiClient } from "@/lib/api-client";

export const getCurrentUser = () =>
  apiClient("GET", "/auth/me", apiSuccessSchema(meSchema));
