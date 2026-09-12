import type { ZodTypeAny, infer as ZodInfer } from "zod";
import { apiErrorSchema } from "@shared/contracts";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

export async function apiClient<T extends ZodTypeAny>(
  method: string,
  path: string,
  schema: T,
  body?: unknown,
): Promise<ZodInfer<T>> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(payload);
    throw new ApiClientError(
      error.success ? error.data.error.message : "The server returned an invalid error response.",
      response.status,
      error.success ? error.data.error.code : "INVALID_ERROR_RESPONSE",
      error.success ? error.data.error.requestId : response.headers.get("x-request-id") ?? undefined,
    );
  }
  return schema.parse(payload);
}