import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";
import { assertSafeIsolatedTestDatabaseName } from "../../server/db/test-safety";

const run = promisify(execFile);

export function assertSafeIsolatedTestDatabase(databaseUrl: string, databaseName: string) {
  assertSafeIsolatedTestDatabaseName(databaseName);
  const url = new URL(databaseUrl);
  if (!url.pathname || url.pathname === "/") throw new Error("A base development database URL is required.");
}

export async function createIsolatedPostgresDatabase() {
  const baseDatabaseUrl = process.env.DATABASE_URL;
  if (!baseDatabaseUrl) throw new Error("DATABASE_URL is required to provision an isolated test database.");
  const databaseName = `vault_test_${randomUUID().replaceAll("-", "_")}`;
  assertSafeIsolatedTestDatabase(baseDatabaseUrl, databaseName);

  const testUrl = new URL(baseDatabaseUrl);
  testUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: baseDatabaseUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);

  const migrationClient = new Client({ connectionString: testUrl.toString() });
  await migrationClient.connect();
  await migrationClient.end();
  await run("npx", ["drizzle-kit", "migrate"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl.toString(), NODE_ENV: "test" },
  });
  const client = new Client({ connectionString: testUrl.toString() });
  await client.connect();

  return {
    databaseUrl: testUrl.toString(),
    client,
    async destroy() {
      await client.end();
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await admin.end();
    },
  };
}