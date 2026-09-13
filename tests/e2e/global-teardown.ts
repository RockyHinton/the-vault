// Drops the disposable database created by tests/e2e/test-server.ts.
// Playwright runs this before it stops the web server; DROP ... WITH (FORCE)
// terminates the server's remaining connections.
import "../../server/config/load-env";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { TEST_STORAGE_ROOT_PREFIX } from "../../server/files/local-file-storage";
import { dropIsolatedPostgresDatabase } from "../support/isolated-postgres";

export default async function globalTeardown() {
  process.env.NODE_ENV = "test";
  const stateFile = process.env.VAULT_E2E_STATE_FILE;
  if (!stateFile || !existsSync(stateFile)) return;
  const state = JSON.parse(readFileSync(stateFile, "utf-8")) as {
    databaseName?: string;
    storageRoot?: string;
  };
  if (state.databaseName)
    await dropIsolatedPostgresDatabase(state.databaseName);
  if (
    state.storageRoot &&
    path.basename(state.storageRoot).startsWith(TEST_STORAGE_ROOT_PREFIX)
  )
    rmSync(state.storageRoot, { recursive: true, force: true });
  rmSync(stateFile, { force: true });
}
