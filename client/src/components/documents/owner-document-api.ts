import { z } from "zod";
import {
  apiSuccessSchema,
  type AttachNewOwnerDocumentInput,
} from "@shared/contracts";
import { apiClient } from "@/lib/api-client";

/**
 * The three owner→documents commands every owning domain exposes at
 * `<owner path>/documents`. Each feature wraps these with its own response
 * schema so the hooks stay typed to the owner's contract.
 */
export function ownerDocumentApi<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
) {
  const response = apiSuccessSchema(schema);
  return {
    attachNew: (ownerPath: string, input: AttachNewOwnerDocumentInput) =>
      apiClient("POST", `${ownerPath}/documents`, response, input),
    attachExisting: (ownerPath: string, documentId: string) =>
      apiClient("PUT", `${ownerPath}/documents/${documentId}`, response),
    detach: (ownerPath: string, documentId: string) =>
      apiClient("DELETE", `${ownerPath}/documents/${documentId}`, response),
  };
}
