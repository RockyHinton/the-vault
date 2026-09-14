import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Distinct from the local dev port (5001) and macOS's reserved 5000, so a
// running dev server never blocks the browser tests.
const port = Number(process.env.VAULT_E2E_PORT ?? 5101);
const baseURL = `http://127.0.0.1:${port}`;
// Written by the test server, read by global teardown. Contains only the
// disposable database name. Lives in Playwright's (git-ignored) output dir.
const stateFile = path.resolve(process.cwd(), "test-results", "e2e-database.json");
// globalTeardown runs in this (runner) process, the web server in a child: both need the path.
process.env.VAULT_E2E_STATE_FILE = stateFile;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  timeout: 30_000,
  // One worker, in order: every spec shares one server, one database and the
  // two seeded accounts, so specs must never overlap. Reliability and a
  // readable failure beat a faster wall clock here.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },
  webServer: {
    command: "tsx tests/e2e/test-server.ts",
    url: `${baseURL}/api/v1/health`,
    env: {
      VAULT_E2E_PORT: String(port),
      VAULT_E2E_STATE_FILE: stateFile,
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
