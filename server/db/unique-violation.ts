import { ApiError } from "../http/errors";

/**
 * PostgreSQL unique-violation mapping for expected business races.
 *
 * Every "one X per Y" rule in the Vault is enforced by a unique index, and the
 * service also checks it before inserting so the normal path answers a clear
 * 409. Two concurrent callers can both pass that check; PostgreSQL then
 * refuses the second insert with SQLSTATE 23505 and the transaction rolls
 * back (no partial state, no audit event). This helper turns that specific,
 * named violation into the same stable conflict the pre-check would have
 * produced. Any other error, including a unique violation on a different
 * constraint, is rethrown untouched: this is a mapping for known races, not a
 * database-error translation layer.
 */
export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; constraint?: unknown };
  if (candidate.code !== "23505") return false;
  return constraint === undefined || candidate.constraint === constraint;
}

/** Runs the unit of work; a unique violation on `constraint` becomes `conflict()`. */
export async function withUniqueViolationAsConflict<T>(
  constraint: string,
  conflict: () => ApiError,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isUniqueViolation(error, constraint)) throw conflict();
    throw error;
  }
}
