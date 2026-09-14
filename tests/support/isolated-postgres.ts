import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
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

/**
 * Every disposable database this harness creates leaves a marker file here
 * until it is dropped. A crashed run leaves the marker behind, and only a
 * marked, idle, `vault_test_*` database is ever swept (see
 * `sweepStaleTestDatabases`). Nothing outside this directory is considered.
 */
export const TEST_DATABASE_MARKER_DIR = path.resolve(
  process.cwd(),
  "test-results",
  "test-databases",
);

function markerPath(databaseName: string): string {
  return path.join(TEST_DATABASE_MARKER_DIR, `${databaseName}.json`);
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

  mkdirSync(TEST_DATABASE_MARKER_DIR, { recursive: true });
  writeFileSync(
    markerPath(databaseName),
    JSON.stringify({ databaseName, createdAt: new Date().toISOString() }),
  );
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
  rmSync(markerPath(databaseName), { force: true });
}

/**
 * Drops disposable databases left behind by a crashed run. Narrow by
 * construction: a candidate must have a marker file this harness wrote,
 * be older than `olderThanMs`, match the `vault_test_*` rule, still exist,
 * and have no live connections. Never lists or touches other databases.
 */
export async function sweepStaleTestDatabases(
  olderThanMs = 10 * 60 * 1000,
): Promise<string[]> {
  if (process.env.NODE_ENV !== "test") return [];
  let markers: string[];
  try {
    markers = readdirSync(TEST_DATABASE_MARKER_DIR).filter((f) =>
      f.endsWith(".json"),
    );
  } catch {
    return [];
  }
  const cutoff = Date.now() - olderThanMs;
  const swept: string[] = [];
  const admin = new Client({ connectionString: baseDatabaseUrl() });
  await admin.connect();
  try {
    for (const marker of markers) {
      const databaseName = marker.replace(/\.json$/, "");
      const file = path.join(TEST_DATABASE_MARKER_DIR, marker);
      if (statSync(file).mtimeMs > cutoff) continue;
      assertSafeIsolatedTestDatabaseName(databaseName);
      const exists = await admin.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [databaseName],
      );
      const busy = await admin.query(
        "SELECT 1 FROM pg_stat_activity WHERE datname = $1 LIMIT 1",
        [databaseName],
      );
      if (exists.rows.length === 1 && busy.rows.length === 0) {
        await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
        swept.push(databaseName);
      }
      if (exists.rows.length === 0 || busy.rows.length === 0)
        rmSync(file, { force: true });
    }
  } finally {
    await admin.end();
  }
  return swept;
}
