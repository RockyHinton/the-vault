import { apiSuccessSchema, meSchema, type LoginInput } from "@shared/contracts";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";

const sessionResponse = apiSuccessSchema(meSchema);

export const getCurrentUser = () =>
  apiClient("GET", "/auth/me", sessionResponse);
export const login = (input: LoginInput) =>
  apiClient("POST", "/auth/login", sessionResponse, input);
export const logout = () => apiClient("POST", "/auth/logout", z.undefined());
