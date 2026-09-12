import type { ZodTypeAny, infer as ZodInfer } from "zod";
import { ApiError } from "./errors";

/**
 * The single request-validation boundary. Parse untrusted request input
 * (body, params, query) through this helper; a failure becomes a stable
 * 400 `VALIDATION_ERROR`. Zod errors thrown anywhere else are treated as
 * server failures by the error handler.
 */
export function validate<T extends ZodTypeAny>(
  schema: T,
  value: unknown,
): ZodInfer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ApiError(
    400,
    "VALIDATION_ERROR",
    "The request was invalid.",
    result.error.flatten(),
  );
}
