import {
  apiSuccessSchema,
  vaultUserSchema,
  type ApplicationRole,
  type ProvisionUserInput,
} from "@shared/contracts";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";

const userResponse = apiSuccessSchema(vaultUserSchema);
const userListResponse = apiSuccessSchema(
  z.object({ items: z.array(vaultUserSchema) }),
);

export const listUsers = (status: "active" | "suspended" | "all" = "all") =>
  apiClient("GET", `/users?status=${status}`, userListResponse);
export const provisionUser = (input: ProvisionUserInput) =>
  apiClient("POST", "/users", userResponse, input);
export const changeUserRole = (
  id: string,
  input: { role: ApplicationRole; version: number },
) => apiClient("POST", `/users/${id}/role`, userResponse, input);
export const suspendUser = (id: string, version: number) =>
  apiClient("POST", `/users/${id}/suspend`, userResponse, { version });
export const reinstateUser = (id: string, version: number) =>
  apiClient("POST", `/users/${id}/reinstate`, userResponse, { version });
