// Runs once before the Playwright web server starts: drops test databases a
// previous crashed run left behind (marker-guarded, idle, vault_test_* only).
import "../../server/config/load-env";
import { sweepStaleTestDatabases } from "../support/isolated-postgres";

export default async function globalSetup() {
  process.env.NODE_ENV = "test";
  const swept = await sweepStaleTestDatabases();
  if (swept.length)
    console.info(`Swept stale test databases: ${swept.join(", ")}`);
}
