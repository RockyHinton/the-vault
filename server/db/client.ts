import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";
import { readEnvironment } from "../config/env";

let pool: Pool | undefined;

export function getDatabase() {
  if (!pool) {
    const env = readEnvironment();
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      options: env.DATABASE_SCHEMA
        ? `-c search_path=${env.DATABASE_SCHEMA}`
        : undefined,
    });
    pool.on("error", (error) => {
      console.error(
        JSON.stringify({
          level: "error",
          event: "database.pool_error",
          message: error.message,
        }),
      );
    });
  }
  return drizzle(pool, { schema });
}

export async function closeDatabase() {
  await pool?.end();
  pool = undefined;
}
