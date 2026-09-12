import { createServer } from "node:http";
import { closeDatabase } from "../../server/db/client";
import { errorHandler } from "../../server/http/errors";
import { createApp } from "../../server/index";
import { registerRoutes } from "../../server/routes";
import { setupVite } from "../../server/vite";
import { createIsolatedPostgresDatabase } from "../support/isolated-postgres";

const identity = { clerkUserId: "playwright_bootstrap", email: "playwright@vault.test", displayName: "Playwright Admin" };

async function start() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for browser tests.");
  process.env.NODE_ENV = "test";
  process.env.VAULT_BOOTSTRAP_ADMIN_CLERK_ID = identity.clerkUserId;
  process.env.VAULT_TEST_IDENTITY = JSON.stringify(identity);
  const database = await createIsolatedPostgresDatabase();
  process.env.DATABASE_URL = database.databaseUrl;
  delete process.env.DATABASE_SCHEMA;

  const app = createApp({ verifiedIdentity: identity });
  const server = await registerRoutes(createServer(app), app, { requireLocalUser: app.locals.requireLocalUser });
  app.use(errorHandler);
  await setupVite(server, app);
  await new Promise<void>((resolve) => server.listen(5001, "127.0.0.1", resolve));

  const shutdown = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDatabase();
    await database.destroy();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}

void start();