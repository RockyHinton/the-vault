import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5001",
    ...devices["Desktop Chrome"],
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },
  webServer: {
    command: "VAULT_TEST_APP_FACTORY=true tsx tests/e2e/test-server.ts",
    url: "http://127.0.0.1:5001/api/v1/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});