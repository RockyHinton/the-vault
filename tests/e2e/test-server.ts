// Playwright web server: the real Vault app (API + Vite) on a disposable
// database seeded with a studio_admin and an ordinary user. Browser tests
// sign in through the real login form; nothing bypasses authentication.
//
// Playwright kills this process without letting shutdown hooks run, so the
// database name is written to VAULT_E2E_STATE_FILE and dropped by
// tests/e2e/global-teardown.ts.
import "../../server/config/load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createVaultServer } from "../../server/app";
import { createDatabase } from "../../server/db/client";
import { createIsolatedPostgresDatabase } from "../support/isolated-postgres";
import { seedAccessFixtures, testEnvironment } from "../support/test-context";

async function start() {
  process.env.NODE_ENV = "test";
  const port = Number(process.env.VAULT_E2E_PORT ?? 5101);
  const stateFile = process.env.VAULT_E2E_STATE_FILE;
  if (!stateFile) throw new Error("VAULT_E2E_STATE_FILE is required.");

  const database = await createIsolatedPostgresDatabase();
  // Only the URL is needed here; the app owns its own pool.
  await database.client.end();
  mkdirSync(path.dirname(stateFile), { recursive: true });
  writeFileSync(
    stateFile,
    JSON.stringify({ databaseName: database.databaseName }),
  );

  const env = testEnvironment({
    DATABASE_URL: database.databaseUrl,
    PORT: String(port),
  });
  const handle = createDatabase({
    databaseUrl: env.DATABASE_URL,
    nodeEnv: env.NODE_ENV,
  });
  await seedAccessFixtures(handle.db);
  const { httpServer } = await createVaultServer({
    env,
    db: handle.db,
    frontend: "vite",
  });
  await new Promise<void>((resolve) =>
    httpServer.listen(env.PORT, "127.0.0.1", resolve),
  );
}

start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
