import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";
import {
  assertSafeIsolatedTestDatabaseName,
  databaseNameFromUrl,
} from "../../server/db/test-safety";

const run = promisify(execFile);

export interface IsolatedPostgresDatabase {
  databaseUrl: string;
  databaseName: string;
  /** Raw client on the disposable database for assertions and fixtures. */
  client: Client;
  destroy(): Promise<void>;
}

function baseDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error(
      "DATABASE_URL is required to provision an isolated test database.",
    );
  if (!databaseNameFromUrl(url))
    throw new Error("A base development database URL is required.");
  return url;
}

/**
 * Creates a uniquely named `vault_test_*` database on the development
 * cluster, applies the checked-in migrations with the same drizzle-kit
 * command production uses, and returns a handle that drops it afterwards.
 * Never touches the development database's own tables.
 */
export async function createIsolatedPostgresDatabase(): Promise<IsolatedPostgresDatabase> {
  const base = baseDatabaseUrl();
  const databaseName = `vault_test_${randomUUID().replaceAll("-", "_")}`;
  assertSafeIsolatedTestDatabaseName(databaseName);

  const testUrl = new URL(base);
  testUrl.pathname = `/${databaseName}`;
  const databaseUrl = testUrl.toString();

  const admin = new Client({ connectionString: base });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }

  await run("npx", ["drizzle-kit", "migrate"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test" },
  });

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  return {
    databaseUrl,
    databaseName,
    client,
    async destroy() {
      await client.end();
      await dropIsolatedPostgresDatabase(databaseName);
    },
  };
}

/** Drops a disposable database by name. Safe to call when it no longer exists. */
export async function dropIsolatedPostgresDatabase(
  databaseName: string,
): Promise<void> {
  assertSafeIsolatedTestDatabaseName(databaseName);
  const admin = new Client({ connectionString: baseDatabaseUrl() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}
