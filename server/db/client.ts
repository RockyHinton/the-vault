import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";
import { assertTestDatabaseUrl } from "./test-safety";

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  close(): Promise<void>;
}

/**
 * Creates the application's connection pool. There is deliberately no
 * module-level singleton: the composition root (`server/app.ts`, tests) owns
 * the handle and passes `db` down explicitly.
 *
 * Fail-closed test guard: when NODE_ENV=test the target database name must
 * match `vault_test_*`, so a test can never bind the application pool to a
 * development or production database, whatever order files execute in.
 */
export function createDatabase(input: {
  databaseUrl: string;
  nodeEnv: string;
}): DatabaseHandle {
  if (input.nodeEnv === "test") assertTestDatabaseUrl(input.databaseUrl);
  const pool = new Pool({ connectionString: input.databaseUrl, max: 10 });
  pool.on("error", (error) => {
    console.error(
      JSON.stringify({
        level: "error",
        event: "database.pool_error",
        message: error.message,
      }),
    );
  });
  return {
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}
