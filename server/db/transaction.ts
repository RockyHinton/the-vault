import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgTransaction } from "drizzle-orm/node-postgres";
import type * as schema from "@shared/schema";
import type { Database } from "./client";

export type Transaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * Anything a repository can run queries against: the root connection for
 * plain reads, or an open transaction for atomic business operations.
 */
export type DatabaseExecutor = Database | Transaction;

/**
 * Transaction ownership rule: a service/use-case opens the unit of work and
 * passes `tx` into every repository call that must commit or roll back
 * together. Repositories never open transactions themselves. Throwing inside
 * `work` rolls the transaction back and re-throws.
 */
export function withTransaction<T>(
  db: Database,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(work);
}
