import { useQuery } from "@tanstack/react-query";
import type { ApplicationRole, ProvisionUserInput } from "@shared/contracts";
import { useVaultMutation } from "@/lib/mutations";
import {
  changeUserRole,
  listUsers,
  provisionUser,
  reinstateUser,
  suspendUser,
} from "./users-api";

const usersKey = ["users"] as const;
const auditKey = ["audit-events"] as const;

export function useUsers(status: "active" | "suspended" | "all" = "all") {
  return useQuery({
    queryKey: [...usersKey, status],
    queryFn: () => listUsers(status),
  });
}

const afterUserChange = () => [usersKey, auditKey];

export function useProvisionUser() {
  return useVaultMutation({
    mutationFn: (input: ProvisionUserInput) => provisionUser(input),
    invalidate: afterUserChange,
    successMessage: (result) =>
      `${result.data.displayName ?? result.data.email ?? "User"} can now sign in.`,
  });
}

export function useChangeUserRole() {
  return useVaultMutation({
    mutationFn: ({
      id,
      role,
      version,
    }: {
      id: string;
      role: ApplicationRole;
      version: number;
    }) => changeUserRole(id, { role, version }),
    invalidate: afterUserChange,
    successMessage: "Role updated.",
  });
}

export function useSuspendUser() {
  return useVaultMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      suspendUser(id, version),
    invalidate: afterUserChange,
    successMessage: "User suspended.",
  });
}

export function useReinstateUser() {
  return useVaultMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      reinstateUser(id, version),
    invalidate: afterUserChange,
    successMessage: "User reinstated.",
  });
}
