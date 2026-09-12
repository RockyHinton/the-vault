import "./config/load-env";
import { readEnvironment } from "./config/env";
import { createDatabase } from "./db/client";
import { createVaultServer } from "./app";
import { log } from "./observability/logger";

/**
 * Process entrypoint. Configuration comes from the environment (plus
 * `.env.local` outside production, loaded by the import above); everything
 * else is assembled by `createVaultServer`.
 */
async function start() {
  const env = readEnvironment();
  const database = createDatabase({
    databaseUrl: env.DATABASE_URL,
    nodeEnv: env.NODE_ENV,
  });
  const { httpServer } = await createVaultServer({
    env,
    db: database.db,
    frontend: env.NODE_ENV === "production" ? "static" : "vite",
  });

  httpServer.listen({ port: env.PORT, host: "0.0.0.0" }, () => {
    log("info", "server.started", {
      port: env.PORT,
      environment: env.NODE_ENV,
    });
  });
}

start().catch((error: unknown) => {
  log("error", "server.start_failed", {
    message: error instanceof Error ? error.message : "Unknown error",
  });
  process.exit(1);
});
